import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSurvey,
  addSurveyTranscript,
  type SurveyTranscript,
} from "../src/lib/survey";
import {
  reconcileSurveyBatch,
  reconciliationBatches,
  reconciliationRequest,
  surveyConversationFingerprint,
} from "../src/lib/survey-reconciliation-client";

const passage = (
  index: number,
  text = `Statement ${index}`,
): SurveyTranscript => ({
  id: `passage-${index}`,
  index,
  text,
  timestamp: "2026-11-13T10:00:00.000Z",
  source: "manual",
  language: "auto",
});
const surveyWith = (segments: SurveyTranscript[]) =>
  segments.reduce(
    (s, p) => addSurveyTranscript(s, p),
    createSurvey({ householdId: "test-home" }),
  );
afterEach(() => vi.unstubAllGlobals());

describe("full-conversation batching and response boundaries", () => {
  it("accepts the full target character limit in Kannada without truncation", () => {
    const original = passage(0, "ಕ".repeat(16000));
    const survey = surveyWith([original]);
    const body = reconciliationRequest(survey, [original]);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
      256000,
    );
    expect(JSON.parse(body).segments[0].text).toBe(original.text);
  });
  it("covers every passage once, newest batches first, within count and character caps", () => {
    const segments = Array.from({ length: 31 }, (_, i) =>
      passage(i, `Turn ${i}: ${"ಕ".repeat(1600)}`),
    );
    const original = structuredClone(segments);
    const batches = reconciliationBatches(segments);
    expect(batches.flat()).toHaveLength(31);
    expect(new Set(batches.flat().map((p) => p.id)).size).toBe(31);
    expect(batches[0].at(-1)?.index).toBe(30);
    expect(batches.at(-1)?.[0].index).toBe(0);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(12);
      expect(batch.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(
        16000,
      );
      expect(batch.map((p) => p.index)).toEqual(
        batch.map((p) => p.index).sort((a, b) => a - b),
      );
    }
    expect(segments).toEqual(original);
  });
  it("preserves an intact Indic target passage within the byte cap", () => {
    const segments = [
      passage(0, "ಕ".repeat(16000)),
      passage(1, "ಕ".repeat(16000)),
      passage(2, "ಅಪ್ಪನಿಗೆ ಬಿಪಿ ಇದೆ"),
    ];
    const survey = surveyWith(segments);
    const body = reconciliationRequest(survey, [segments[2]]);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
      256000,
    );
    const request = JSON.parse(body);
    expect(request.segments).toEqual([segments[2]]);
    expect(request.survey.transcripts.at(-1)).toEqual(segments[2]);
    expect(request.survey.transcripts.length).toBeLessThanOrEqual(3);
    expect(survey.transcripts).toHaveLength(3);
  });
  it("allows a verified empty result after the whole requested batch was examined", async () => {
    const segment = passage(0);
    const survey = surveyWith([segment]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          surveyId: survey.id,
          baseRevision: survey.revision,
          checkedSegmentIds: [segment.id],
          envelopes: [],
        }),
      ),
    );
    expect(
      (await reconcileSurveyBatch(survey, [segment])).checkedSegmentIds,
    ).toEqual([segment.id]);
  });
  it("rejects an incomplete check and a mismatched revision instead of claiming completion", async () => {
    const segments = [passage(0), passage(1)];
    const survey = surveyWith(segments);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          surveyId: survey.id,
          baseRevision: survey.revision,
          checkedSegmentIds: [segments[0].id],
          envelopes: [],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          surveyId: survey.id,
          baseRevision: survey.revision - 1,
          checkedSegmentIds: segments.map((p) => p.id),
          envelopes: [],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(reconcileSurveyBatch(survey, segments)).rejects.toThrow(
      "did not match",
    );
    await expect(reconcileSurveyBatch(survey, segments)).rejects.toThrow(
      "did not match",
    );
  });
  it("rejects duplicate checked IDs", async () => {
    const segments = [passage(0), passage(1)];
    const survey = surveyWith(segments);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          surveyId: survey.id,
          baseRevision: survey.revision,
          checkedSegmentIds: [segments[0].id, segments[0].id],
          envelopes: [],
        }),
      ),
    );
    await expect(reconcileSurveyBatch(survey, segments)).rejects.toThrow(
      "did not match",
    );
  });
  it("invalidates review for same-length text corrections and reset generations", () => {
    const survey = surveyWith([passage(0, "Age 20")]);
    const original = surveyConversationFingerprint(survey);
    expect(
      surveyConversationFingerprint({
        ...survey,
        transcripts: [{ ...survey.transcripts[0], text: "Age 30" }],
      }),
    ).not.toBe(original);
    expect(
      surveyConversationFingerprint({
        ...survey,
        workspaceGeneration: "new-generation",
      }),
    ).not.toBe(original);
    expect(
      surveyConversationFingerprint({
        ...survey,
        fields: [
          ...survey.fields,
          {
            id: "custom-water",
            label: "Water source",
            scope: "household",
            type: "text",
            section: "household",
            required: false,
          },
        ],
      }),
    ).not.toBe(original);
    expect(
      surveyConversationFingerprint({
        ...survey,
        fields: survey.fields.map((field, index) =>
          index === 0 ? { ...field, label: "Updated question" } : field,
        ),
      }),
    ).not.toBe(original);
  });
});
