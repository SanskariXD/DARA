import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { POST as extract } from "../src/app/api/extract/route";
import {
  POST as transcribe,
  validateWav,
} from "../src/app/api/speech/transcribe/route";
import { GET as health } from "../src/app/api/health/route";
import { DELETE as logout } from "../src/app/api/auth/session/route";
import {
  addSurveyTranscript,
  createSurvey,
  type SurveyTranscript,
} from "../src/lib/survey";
import {
  decodeProviderWire,
  extractSurveyFacts,
  validateProviderExtraction,
} from "../src/lib/server/live-providers";
import {
  hasWorkspaceSession,
  requireWorkspaceSession,
  unlockWorkspace,
} from "../src/lib/server/access";

const base = "https://dara.test";
const segment: SurveyTranscript = {
  id: "seg-1",
  index: 0,
  text: "There are three people. My name is Anjali. I am 28 years old.",
  timestamp: "2026-11-13T01:00:00.000Z",
  language: "en",
  source: "manual",
};
const survey = () =>
  addSurveyTranscript(createSurvey({ householdId: "test-household" }), segment);
const wire = () => ({
  familySize: 3,
  familySizeEvidence: "There are three people.",
  members: [
    {
      memberId: null,
      slot: 1,
      fields: [
        { fieldId: "name", value: "Anjali", evidence: "My name is Anjali." },
        { fieldId: "age", value: "28", evidence: "I am 28 years old." },
      ],
      evidence: segment.text,
      uncertain: false,
    },
  ],
  householdFields: [],
  notes: [],
  uncertainties: [],
});
let loginSequence = 0;
function cookie() {
  return unlockWorkspace(
    new Request(`${base}/api/auth/session`, {
      headers: { origin: base, "x-real-ip": `test-${++loginSequence}` },
    }),
    "test-access-code",
  ).split(";")[0];
}
function jsonRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`${base}/api/extract`, {
    method: "POST",
    headers: {
      origin: base,
      cookie: cookie(),
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
function wav(seconds = 1) {
  const samples = Math.round(16000 * seconds),
    b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}
function audioRequest(
  audio = new Blob([wav()], { type: "audio/wav" }),
  language = "en",
) {
  const form = new FormData();
  form.set("audio_file", audio, "speech.wav");
  form.set("language", language);
  return new Request(`${base}/api/speech/transcribe`, {
    method: "POST",
    headers: { origin: base, cookie: cookie() },
    body: form,
  });
}
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret");
  vi.stubEnv("GNANI_API_KEY", "test-gnani-secret");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
  vi.stubEnv("DARA_ACCESS_CODE", "test-access-code");
  vi.stubEnv("DARA_SESSION_SECRET", "test-session-secret-long-enough");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live extraction boundary", () => {
  it("requires access before parsing or invoking providers", async () => {
    const response = await extract(
      new Request(`${base}/api/extract`, { method: "POST", body: "bad-json" }),
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects foreign origin even with a signed cookie and spoofed forwarded host", async () => {
    const response = await extract(
      jsonRequest(
        { survey: survey(), segment },
        { origin: "https://evil.test", "x-forwarded-host": "evil.test" },
      ),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unknown fields, invalid JSON, and wrong content type", async () => {
    expect(
      (
        await extract(
          jsonRequest({ survey: survey(), segment, arbitrary: true }),
        )
      ).status,
    ).toBe(400);
    const headers = {
      origin: base,
      cookie: cookie(),
      "content-type": "application/json",
    };
    expect(
      (
        await extract(
          new Request(`${base}/api/extract`, {
            method: "POST",
            headers,
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await extract(jsonRequest({}, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds bodies without trusting content-length", async () => {
    expect(
      (await extract(jsonRequest({ huge: "x".repeat(50_001) }))).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects mismatched source passages and completed surveys", async () => {
    const draft = survey();
    expect(
      (
        await extract(
          jsonRequest({
            survey: draft,
            segment: { ...segment, text: "Different" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await extract(
          jsonRequest({
            survey: {
              ...draft,
              status: "completed",
              completedAt: segment.timestamp,
            },
            segment,
          }),
        )
      ).status,
    ).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns a validated envelope through the real HTTP handler", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(wire()) }] },
          },
        ],
      }),
    );
    const draft = survey();
    const response = await extract(jsonRequest({ survey: draft, segment }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      surveyId: draft.id,
      segmentId: segment.id,
      baseRevision: draft.revision,
      result: { familySize: 3, members: [{ name: "Anjali", age: 28 }] },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
      "test-gemini-secret",
    );
    expect(String(init?.body)).not.toContain("test-gemini-secret");
  });
  it("rejects unsupported model fields, unknown members, and invented evidence", () => {
    const draft = survey();
    const valid = { familySize: null, members: [], notes: [] };
    expect(() =>
      validateProviderExtraction(
        { ...valid, diagnosis: "made-up" },
        draft,
        segment,
      ),
    ).toThrow();
    expect(() =>
      validateProviderExtraction(
        {
          ...valid,
          members: [
            { memberId: "unknown", name: "Anjali", evidence: segment.text },
          ],
        },
        draft,
        segment,
      ),
    ).toThrow();
    expect(() =>
      validateProviderExtraction(
        { ...valid, notes: [{ text: "invented", evidence: "never spoken" }] },
        draft,
        segment,
      ),
    ).toThrow();
    const unknown = wire();
    unknown.members[0].fields[0].fieldId = "arbitrary-field";
    expect(() => decodeProviderWire(unknown, draft, segment)).toThrow();
  });
  it("preserves current values and manual locks while returning proposals", () => {
    const draft = survey();
    const snapshot = JSON.stringify(draft);
    expect(decodeProviderWire(wire(), draft, segment).members[0].age).toBe(28);
    expect(JSON.stringify(draft)).toBe(snapshot);
  });
  it("rejects ambiguous field lists, empty unknown IDs, invalid numeric syntax and oversized narrative copies", () => {
    const draft = survey();
    const blankUnknown = wire();
    blankUnknown.members[0].fields.push({
      fieldId: "unknown",
      value: "",
      evidence: segment.text,
    });
    expect(() => decodeProviderWire(blankUnknown, draft, segment)).toThrow();
    const duplicate = wire();
    duplicate.members[0].fields.push(duplicate.members[0].fields[0]);
    expect(() => decodeProviderWire(duplicate, draft, segment)).toThrow();
    const numeric = wire();
    numeric.members[0].fields[1].value = "28 years";
    expect(() => decodeProviderWire(numeric, draft, segment)).toThrow();
    const householdField = {
      fieldId: "householdNotes",
      value: "Note",
      evidence: segment.text,
    };
    expect(() =>
      decodeProviderWire(
        { ...wire(), householdFields: [householdField, householdField] },
        draft,
        segment,
      ),
    ).toThrow();
    const longSegment = { ...segment, text: "x".repeat(5000) };
    expect(() =>
      validateProviderExtraction(
        {
          familySize: null,
          members: [],
          notes: [{ text: "short", evidence: longSegment.text }],
        },
        draft,
        longSegment,
      ),
    ).toThrow();
  });
  it("fails closed on provider credentials, quota and invalid responses without reflecting upstream bodies", async () => {
    for (const [upstream, expected, code] of [
      [401, 503, "PROVIDER_AUTH_FAILED"],
      [429, 429, "PROVIDER_LIMIT"],
      [500, 502, "PROVIDER_REJECTED"],
    ] as const) {
      vi.mocked(fetch).mockResolvedValue(
        Response.json(
          {
            secret: "test-gemini-secret",
            message: "private upstream diagnostics",
          },
          { status: upstream },
        ),
      );
      const response = await extract(
        jsonRequest({ survey: survey(), segment }),
      );
      expect(response.status).toBe(expected);
      const body = await response.text();
      expect(body).toContain(code);
      expect(body).not.toContain("test-gemini-secret");
      expect(body).not.toContain("private upstream");
    }
  });
  it("does not call a provider when its key is absent", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(extractSurveyFacts(survey(), segment)).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("WAV transcription boundary", () => {
  it("accepts a bounded complete PCM WAV and rejects wrong duration/encoding", () => {
    expect(validateWav(wav())).toBe(1);
    expect(() => validateWav(wav(0.05))).toThrow();
    expect(() => validateWav(wav(31))).toThrow();
    const wrong = wav();
    wrong.writeUInt16LE(2, 22);
    expect(() => validateWav(wrong)).toThrow();
    expect(() => validateWav(new Uint8Array([1, 2, 3]))).toThrow();
  });
  it("requires session before reading audio", async () => {
    expect(
      (
        await transcribe(
          new Request(`${base}/api/speech/transcribe`, { method: "POST" }),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects WebM and unrecognized language without forwarding", async () => {
    expect(
      (
        await transcribe(
          audioRequest(new Blob([wav()], { type: "audio/webm" })),
        )
      ).status,
    ).toBe(415);
    expect((await transcribe(audioRequest(undefined, "xx"))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds multipart uploads", async () => {
    const upload = audioRequest(
      new Blob([new Uint8Array(1_100_000)], { type: "audio/wav" }),
    );
    // Materialize the simulated wire body before cancellation: Node's synthetic
    // FormData producer can otherwise enqueue after its stream was cancelled.
    const body = await upload.arrayBuffer();
    expect(
      (
        await transcribe(
          new Request(upload.url, {
            method: "POST",
            headers: upload.headers,
            body,
          }),
        )
      ).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards documented fields and returns only sanitized transcript data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        transcript: " Hello. ",
        detected_language_code: "kn-IN",
        request_id: "private-provider-id",
      }),
    );
    const response = await transcribe(audioRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Hello.", language: "kn" });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.vachana.ai/stt/v3");
    expect(new Headers(init?.headers).get("X-API-Key-ID")).toBe(
      "test-gnani-secret",
    );
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("prisma-v3.0");
    expect(form.get("language_code")).toBe("en-IN");
    expect(form.get("format")).toBe("transcribe");
  });
});

describe("session and configuration exposure", () => {
  it("rejects wrong code, tampered and expired cookies", () => {
    const request = new Request(`${base}/api/auth/session`, {
      headers: { origin: base },
    });
    expect(() => unlockWorkspace(request, "wrong")).toThrow();
    const signed = cookie();
    expect(
      hasWorkspaceSession(new Request(base, { headers: { cookie: signed } })),
    ).toBe(true);
    expect(
      hasWorkspaceSession(
        new Request(base, { headers: { cookie: signed + "tampered" } }),
      ),
    ).toBe(false);
    const value = `${Math.floor(Date.now() / 1000) - 1}.nonce`;
    const mac = createHmac("sha256", "test-session-secret-long-enough")
      .update(value)
      .digest("base64url");
    expect(
      hasWorkspaceSession(
        new Request(base, {
          headers: { cookie: `dara_session=${value}.${mac}` },
        }),
      ),
    ).toBe(false);
  });
  it("rejects absent signing configuration and clears session on logout", async () => {
    const signed = cookie();
    vi.stubEnv("DARA_SESSION_SECRET", "");
    expect(() =>
      requireWorkspaceSession(
        new Request(base, { headers: { cookie: signed } }),
      ),
    ).toThrow();
    const response = await logout(
      new Request(`${base}/api/auth/session`, {
        method: "DELETE",
        headers: { origin: base },
      }),
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("health discloses configuration status but no secrets or false live verification", async () => {
    const response = health();
    const body = await response.text();
    expect(body).toContain('"configurationOnly":true');
    expect(body).toContain('"speech":"configured"');
    expect(body).not.toContain("test-gemini-secret");
    expect(body).not.toContain("test-gnani-secret");
  });
});
