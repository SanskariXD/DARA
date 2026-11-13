import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addSurveyTranscript,
  createSurvey,
  editSurveyField,
  type SurveyTranscript,
} from "../src/lib/survey";
import { selectSurveyContext } from "../src/lib/survey-context";
import { reconciliationRequest } from "../src/lib/survey-reconciliation-client";
import { extractSurvey } from "../src/lib/survey-extraction-client";
function conversation() {
  let survey = editSurveyField(
    createSurvey({ householdId: "context-home" }),
    null,
    "familySize",
    2,
  );
  survey = editSurveyField(survey, survey.members[0].id, "name", "Ajay");
  survey = editSurveyField(survey, survey.members[1].id, "name", "Lakshmi");
  const texts = [
    "My name is Ajay.",
    "My wife is Lakshmi.",
    ...Array.from({ length: 10 }, (_, index) => `Unrelated question ${index}.`),
    "I have body pain.",
  ];
  for (const [index, text] of texts.entries())
    survey = addSurveyTranscript(survey, {
      id: `context-${index}`,
      index,
      text,
      source: "manual",
      language: "en",
      timestamp: "2026-11-14T10:00:00.000Z",
    });
  return survey;
}
afterEach(() => vi.unstubAllGlobals());
describe("durable original respondent context", () => {
  it("retains a distant first-person anchor and third-person topic when recent filler exceeds the window", () => {
    const survey = conversation();
    const target = survey.transcripts.at(-1)!;
    const { segments, anchorIds } = selectSurveyContext(
      survey,
      target.index,
      2,
    );
    expect(anchorIds).toEqual(["context-0", "context-1"]);
    expect(segments.map((segment) => segment.text)).toEqual([
      "My name is Ajay.",
      "My wife is Lakshmi.",
    ]);
    for (const segment of segments)
      expect(survey.transcripts.find((item) => item.id === segment.id)).toBe(
        segment,
      );
    const body = JSON.parse(reconciliationRequest(survey, [target]));
    expect(
      body.survey.transcripts.map((item: SurveyTranscript) => item.id),
    ).toEqual(["context-0", "context-1", target.id]);
  });
  it("sends the same original anchors with ordinary live extraction and never future passages", async () => {
    const survey = conversation();
    const target = survey.transcripts.at(-1)!;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.survey.transcripts).toHaveLength(7);
      expect(
        body.survey.transcripts
          .slice(0, 2)
          .map((item: SurveyTranscript) => item.id),
      ).toEqual(["context-0", "context-1"]);
      expect(
        body.survey.transcripts.every(
          (item: SurveyTranscript) => item.index <= target.index,
        ),
      ).toBe(true);
      return Response.json({
        surveyId: survey.id,
        baseRevision: survey.revision,
        segmentId: target.id,
        segmentIndex: target.index,
        result: { familySize: null, members: [], notes: [] },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await extractSurvey(survey, target);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      selectSurveyContext(survey, 1, 6).segments.map((item) => item.id),
    ).toEqual(["context-0"]);
  });
  it("trims optional large context before identity anchors and preserves original text", async () => {
    const survey = conversation();
    const target = survey.transcripts.at(-1)!;
    const expanded = {
      ...survey,
      transcripts: survey.transcripts.map((segment) =>
        segment.index > 1 && segment.index < target.index
          ? { ...segment, text: "ಕ".repeat(5000) }
          : segment,
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(
          new TextEncoder().encode(String(init?.body)).byteLength,
        ).toBeLessThanOrEqual(50000);
        expect(
          body.survey.transcripts
            .slice(0, 2)
            .map((item: SurveyTranscript) => item.text),
        ).toEqual(["My name is Ajay.", "My wife is Lakshmi."]);
        expect(body.segment).toEqual(target);
        return Response.json({
          surveyId: survey.id,
          baseRevision: survey.revision,
          segmentId: target.id,
          segmentIndex: target.index,
          result: { familySize: null, members: [], notes: [] },
        });
      }),
    );
    await extractSurvey(expanded, target);
  });
});
