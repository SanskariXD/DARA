import { z } from "zod";
import { surveySchema, surveyTranscriptSchema } from "@/lib/survey";
import { requireWorkspaceSession } from "@/lib/server/access";
import { extractSurveyFacts } from "@/lib/server/live-providers";
import { providerErrorResponse } from "@/lib/server/providers";
import { readJson, handleError, HttpError, noStore } from "@/lib/server/http";

export const maxDuration = 40;
const requestSchema = z
  .object({ survey: surveySchema, segment: surveyTranscriptSchema })
  .strict();

export async function POST(request: Request) {
  try {
    requireWorkspaceSession(request);
    const { survey, segment } = await readJson(request, requestSchema, 50_000);
    if (survey.status !== "draft")
      throw new HttpError(
        409,
        "Completed surveys are read-only. Start a new survey.",
      );
    if (survey.transcripts.length > 7)
      throw new HttpError(
        413,
        "Only recent conversation context can be processed at once.",
      );
    const stored = survey.transcripts.find(
      (item) => item.id === segment.id && item.index === segment.index,
    );
    if (!stored || JSON.stringify(stored) !== JSON.stringify(segment))
      throw new HttpError(400, "The passage does not match this survey.");
    if (survey.processedSegmentIds.includes(segment.id))
      throw new HttpError(409, "This passage has already been applied.");
    const result = await extractSurveyFacts(survey, segment);
    return Response.json(
      {
        surveyId: survey.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        baseRevision: survey.revision,
        result,
      },
      { headers: noStore },
    );
  } catch (error) {
    return providerErrorResponse(error) ?? handleError(error);
  }
}
