import { z } from "zod";
import { surveySchema, surveyTranscriptSchema } from "@/lib/survey";
import { requireWorkspaceSession } from "@/lib/server/access";
import { reconcileSurveyFacts } from "@/lib/server/live-providers";
import { providerErrorResponse } from "@/lib/server/providers";
import { readJson, handleError, HttpError, noStore } from "@/lib/server/http";

export const maxDuration = 40;
const requestSchema = z
  .object({
    survey: surveySchema,
    segments: z.array(surveyTranscriptSchema).min(1).max(12),
  })
  .strict();

export async function POST(request: Request) {
  try {
    requireWorkspaceSession(request);
    const { survey, segments } = await readJson(
      request,
      requestSchema,
      256_000,
    );
    if (survey.status !== "draft")
      throw new HttpError(
        409,
        "Completed surveys are read-only. Start a new survey.",
      );
    if (
      survey.transcripts.length > 14 ||
      segments.reduce((total, segment) => total + segment.text.length, 0) >
        16_000
    )
      throw new HttpError(
        413,
        "Review up to twelve passages and 16,000 characters at a time.",
      );
    const ids = new Set(segments.map((segment) => segment.id));
    if (
      ids.size !== segments.length ||
      new Set(segments.map((segment) => segment.index)).size !== segments.length
    )
      throw new HttpError(
        400,
        "Each original passage can appear only once in a review batch.",
      );
    for (const segment of segments) {
      const stored = survey.transcripts.find((item) => item.id === segment.id);
      if (!stored || JSON.stringify(stored) !== JSON.stringify(segment))
        throw new HttpError(
          400,
          "A review passage does not match the original survey transcript.",
        );
    }
    const extras = survey.transcripts.filter((segment) => !ids.has(segment.id));
    const earliest = Math.min(...segments.map((segment) => segment.index));
    if (
      extras.length > 2 ||
      extras.some((segment) => segment.index >= earliest)
    )
      throw new HttpError(
        400,
        "Only two earlier original passages can be supplied as review context.",
      );
    const envelopes = await reconcileSurveyFacts(survey, segments);
    return Response.json(
      {
        surveyId: survey.id,
        baseRevision: survey.revision,
        checkedSegmentIds: segments.map((segment) => segment.id),
        envelopes,
      },
      { headers: noStore },
    );
  } catch (error) {
    return providerErrorResponse(error) ?? handleError(error);
  }
}
