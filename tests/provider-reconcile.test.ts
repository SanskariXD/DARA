import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reconcile } from "../src/app/api/reconcile/route";
import { POST as transcribe } from "../src/app/api/speech/transcribe/route";
import { unlockWorkspace } from "../src/lib/server/access";
import {
  decodeProviderWire,
  retainMissingProposals,
} from "../src/lib/server/live-providers";
import {
  addSurveyTranscript,
  createSurvey,
  editSurveyField,
  applySurveyExtraction,
  type SurveyTranscript,
} from "../src/lib/survey";

const origin = "https://dara.test";
const segment: SurveyTranscript = {
  id: "original-1",
  index: 0,
  text: "My name is Anjali. I am 28. I have fever.",
  timestamp: "2026-11-13T01:00:00.000Z",
  language: "en",
  source: "manual",
};
const draft = () =>
  addSurveyTranscript(createSurvey({ householdId: "synthetic" }), segment);
const wire = () => ({
  familySize: null,
  familySizeEvidence: null,
  familySizeCorrection: null,
  members: [
    {
      memberId: null,
      slot: 1,
      fields: [
        { fieldId: "age", value: "28", evidence: "I am 28." },
        { fieldId: "healthHistory", value: "fever", evidence: "I have fever." },
      ],
      evidence: segment.text,
      uncertain: false,
      attribution: {
        kind: "name",
        reference: "Anjali",
        evidence: "My name is Anjali.",
        segmentId: segment.id,
      },
      corrections: [],
    },
  ],
  householdFields: [],
  notes: [],
  uncertainties: [],
});
let sequence = 0;
function cookie() {
  return unlockWorkspace(
    new Request(origin, {
      headers: { origin, "x-real-ip": `reconcile-${++sequence}` },
    }),
    "test-code",
  ).split(";")[0];
}
function request(body: unknown) {
  return new Request(`${origin}/api/reconcile`, {
    method: "POST",
    headers: { origin, cookie: cookie(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function provider(value: unknown) {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(value) }] },
        },
      ],
    }),
  );
}
function withMember() {
  let survey = editSurveyField(draft(), null, "familySize", 1);
  survey = editSurveyField(survey, survey.members[0].id, "name", "Anjali");
  return survey;
}
function wav() {
  const bytes = Buffer.alloc(3244);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(3200, 40);
  return bytes;
}
function audio(language?: string) {
  const form = new FormData();
  form.set(
    "audio_file",
    new Blob([wav()], { type: "audio/wav" }),
    "speech.wav",
  );
  if (language) form.set("language", language);
  return new Request(`${origin}/api/speech/transcribe`, {
    method: "POST",
    headers: { origin, cookie: cookie() },
    body: form,
  });
}
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini");
  vi.stubEnv("GNANI_API_KEY", "synthetic-gnani");
  vi.stubEnv("DARA_ACCESS_CODE", "test-code");
  vi.stubEnv("DARA_SESSION_SECRET", "test-signing-secret");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("automatic multilingual transcription", () => {
  it("defaults omitted language to documented indic-auto and preserves detection separately", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        transcript: "Hello",
        detected_language_code: "en-IN",
      }),
    );
    const response = await transcribe(audio());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "Hello",
      language: "en",
      detectedLanguageCode: "en-IN",
    });
    const form = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(form.get("language_code")).toBe("indic-auto");
    expect(form.get("format")).toBe("transcribe");
    expect(form.get("topic")).toContain("household");
  });
  it("supports all six explicit hints without confusing the hint with detection", async () => {
    for (const language of ["en", "kn", "hi", "te", "ta", "ml"]) {
      vi.mocked(fetch).mockResolvedValue(
        Response.json({ success: true, transcript: "123" }),
      );
      const response = await transcribe(audio(language));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        text: "123",
        language: "auto",
        detectedLanguageCode: null,
      });
      const form = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as FormData;
      expect(form.get("language_code")).toBe(`${language}-IN`);
    }
  });
  it("retains unmapped provider language metadata and rejects truncated speech", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        transcript: "spoken words",
        detected_language_code: "bn-IN",
      }),
    );
    expect(await (await transcribe(audio())).json()).toMatchObject({
      language: "auto",
      detectedLanguageCode: "bn-IN",
    });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        transcript: "incomplete",
        truncated: true,
      }),
    );
    expect((await transcribe(audio())).status).toBe(502);
  });
});

describe("original-history reconciliation boundary", () => {
  it("accepts the character limit for native-script originals within the larger byte ceiling", async () => {
    const native = {
      ...segment,
      language: "kn" as const,
      text: "ಅ".repeat(16_000),
    };
    const survey = { ...draft(), transcripts: [native] };
    const input = { survey, segments: [native] };
    expect(
      new TextEncoder().encode(JSON.stringify(input)).byteLength,
    ).toBeGreaterThan(80_000);
    provider({ checkedSegmentIds: [native.id], results: [] });
    expect((await reconcile(request(input))).status).toBe(200);
  });
  it("applies an explicit Hindi duration correction through the active numeric field without inventing temperature", () => {
    let survey = withMember();
    expect(
      survey.fields.some((field) => field.id === "feverDays" && !field.legacy),
    ).toBe(true);
    survey.members[0].values.feverDays = 2;
    survey.members[0].meta.feverDays = {
      source: "extracted",
      revision: survey.revision,
      segmentIndex: 0,
      manuallyProtected: false,
    };
    const current: SurveyTranscript = {
      ...segment,
      id: "duration-correction",
      index: 1,
      language: "hi",
      text: "Anjali को दो दिन नहीं, तीन दिन से बुखार है। तापमान नहीं मापा।",
    };
    survey = addSurveyTranscript(survey, current);
    const input = {
      familySize: null,
      familySizeEvidence: null,
      familySizeCorrection: null,
      members: [
        {
          memberId: survey.members[0].id,
          slot: 1,
          fields: [
            { fieldId: "feverDays", value: "3", evidence: current.text },
            {
              fieldId: "healthHistory",
              value: current.text,
              evidence: current.text,
            },
          ],
          evidence: current.text,
          uncertain: false,
          attribution: {
            kind: "name",
            reference: "Anjali",
            evidence: current.text,
            segmentId: current.id,
          },
          corrections: [
            { fieldId: "feverDays", previousValue: 2, evidence: current.text },
          ],
        },
      ],
      householdFields: [],
      notes: [],
      uncertainties: [],
    };
    const result = decodeProviderWire(input, survey, current);
    const next = applySurveyExtraction(survey, {
      surveyId: survey.id,
      segmentId: current.id,
      segmentIndex: current.index,
      baseRevision: survey.revision,
      result,
    });
    expect(next.members[0].values.feverDays).toBe(3);
    expect(next.members[0].values.temperature).toBeUndefined();
    expect(next.members[0].values.healthHistory).toBe(current.text);
    expect(next.conflicts.filter((item) => !item.resolved)).toHaveLength(0);
  });
  it("recovers only original enclosing spans and discards unsupported unchanged counts", () => {
    const survey = withMember();
    const original = {
      ...segment,
      text: "Anjali is 28. Ravi is 40. Anjali has fever.",
    };
    survey.transcripts = [original];
    const proposal = wire();
    const input = {
      ...proposal,
      familySize: 1,
      members: proposal.members.map((member) => ({
        ...member,
        evidence: "Anjali is 28. Anjali has fever.",
        fields: [
          { fieldId: "age", value: "28", evidence: "Anjali is 28." },
          {
            fieldId: "healthHistory",
            value: "fever",
            evidence: "Anjali has fever.",
          },
        ],
        attribution: {
          kind: "name",
          reference: "Anjali",
          evidence: "Anjali is 28.",
          segmentId: segment.id,
        },
      })),
    };
    const decoded = decodeProviderWire(input, survey, original);
    expect(decoded.familySize).toBeNull();
    expect(decoded.members[0].evidence).toBe(original.text);
    expect(decoded.members[0].fieldEvidence?.healthHistory).toBe(
      "Anjali has fever.",
    );
    expect(() =>
      decodeProviderWire({ ...input, familySize: 2 }, survey, original),
    ).toThrow();
  });
  it("requires session before provider work and rejects forged or oversized batches", async () => {
    expect(
      (
        await reconcile(
          new Request(`${origin}/api/reconcile`, {
            method: "POST",
            body: "bad",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await reconcile(
          request({
            survey: draft(),
            segments: [{ ...segment, text: "forged" }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await reconcile(
          request({ survey: draft(), segments: [segment, segment] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await reconcile(
          request({ survey: draft(), segments: [segment], unexpected: true }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await reconcile(request({ oversized: "x".repeat(256_001) }))).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects future context, completed records and aggregate text overflow", async () => {
    const current = draft(),
      later = { ...segment, id: "later", index: 1 };
    expect(
      (
        await reconcile(
          request({
            survey: { ...current, transcripts: [segment, later] },
            segments: [segment],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await reconcile(
          request({
            survey: {
              ...current,
              status: "completed",
              completedAt: segment.timestamp,
            },
            segments: [segment],
          }),
        )
      ).status,
    ).toBe(409);
    const sources = [
      { ...segment, text: "x".repeat(9000) },
      { ...later, text: "y".repeat(9000) },
    ];
    expect(
      (
        await reconcile(
          request({
            survey: { ...current, transcripts: sources },
            segments: sources,
          }),
        )
      ).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires acknowledgement of every target original and preserves original evidence", async () => {
    const survey = withMember();
    provider({ checkedSegmentIds: [], results: [] });
    expect(
      (await reconcile(request({ survey, segments: [segment] }))).status,
    ).toBe(502);
    provider({
      checkedSegmentIds: [segment.id],
      results: [{ segmentId: segment.id, result: wire() }],
    });
    const response = await reconcile(request({ survey, segments: [segment] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkedSegmentIds).toEqual([segment.id]);
    expect(body.envelopes[0]).toMatchObject({
      surveyId: survey.id,
      segmentId: segment.id,
      segmentIndex: 0,
      baseRevision: survey.revision,
      mode: "reconcile",
      result: {
        members: [
          {
            age: 28,
            healthHistory: "I have fever.",
            fieldEvidence: { healthHistory: "I have fever." },
          },
        ],
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("keeps manual blanks, newer blanks and nonempty answers untouched", () => {
    let survey = withMember();
    survey = editSurveyField(survey, survey.members[0].id, "age", "");
    const result = decodeProviderWire(wire(), survey, segment);
    expect(
      retainMissingProposals(result, survey, segment).members[0],
    ).not.toHaveProperty("age");
    survey.members[0].meta.healthHistory = {
      source: "extracted",
      manuallyProtected: false,
      revision: survey.revision,
      segmentIndex: 2,
    };
    expect(retainMissingProposals(result, survey, segment).members).toEqual([]);
    survey.members[0].values.healthHistory = "Existing factual report";
    survey.members[0].meta.healthHistory = {
      source: "manual",
      manuallyProtected: true,
      revision: survey.revision,
      segmentIndex: 2,
    };
    expect(retainMissingProposals(result, survey, segment).members).toEqual([]);
  });
  it("rejects absent v2 attribution, fabricated original proof and invented field evidence", () => {
    const survey = withMember(),
      missing = {
        ...wire(),
        members: wire().members.map((member) => ({
          ...member,
          attribution: null,
        })),
      };
    expect(() => decodeProviderWire(missing, survey, segment)).toThrow();
    const wrong = wire();
    wrong.members[0].attribution.segmentId = "not-an-original";
    expect(() => decodeProviderWire(wrong, survey, segment)).toThrow();
    const evidence = wire();
    evidence.members[0].fields[0].evidence = "never said";
    expect(() => decodeProviderWire(evidence, survey, segment)).toThrow();
  });
});
