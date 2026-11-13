import { z } from "zod";
import {
  surveyExtractionSchema,
  type Survey,
  type SurveyTranscript,
  type SurveyExtractionEnvelope,
} from "./survey";

const envelopeSchema = z
  .object({
    surveyId: z.string(),
    segmentId: z.string(),
    segmentIndex: z.number().int(),
    baseRevision: z.number().int(),
    result: surveyExtractionSchema,
  })
  .strict();

export async function extractSurvey(
  survey: Survey,
  segment: SurveyTranscript,
): Promise<SurveyExtractionEnvelope> {
  // Keep current values/ownership, but never upload a growing audit or full transcript.
  const recent = survey.transcripts
    .filter((item) => item.index < segment.index)
    .slice(-6);
  const snapshot: Survey = {
    ...survey,
    transcripts: [...recent, segment],
    processedSegmentIds: survey.processedSegmentIds.slice(-100),
    audit: [],
    conflicts: [],
    uncertainties: [],
    notes: [],
  };
  const body = JSON.stringify({ survey: snapshot, segment });
  if (new TextEncoder().encode(body).byteLength > 50_000)
    throw new Error(
      "This survey has too much context for one update. Continue manually or start a shorter survey.",
    );
  let response: Response;
  try {
    response = await fetch("/api/extract", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    throw new Error(
      "Could not complete the update. Your answers are still here; check your connection and retry.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof result?.error?.message === "string"
        ? result.error.message
        : "The passage could not be processed. Please try again.",
    );
  const envelope = envelopeSchema.safeParse(result);
  if (
    !envelope.success ||
    envelope.data.surveyId !== survey.id ||
    envelope.data.segmentId !== segment.id ||
    envelope.data.segmentIndex !== segment.index ||
    envelope.data.baseRevision !== survey.revision
  )
    throw new Error(
      "The update did not match this survey. Your current answers were kept.",
    );
  return envelope.data;
}
