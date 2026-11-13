import { selectSurveyContext } from "./survey-context";
import {
  surveyExtractionEnvelopeSchema,
  type Survey,
  type SurveyTranscript,
  type SurveyExtractionEnvelope,
} from "./survey";

const envelopeSchema = surveyExtractionEnvelopeSchema;

export async function extractSurvey(
  survey: Survey,
  segment: SurveyTranscript,
): Promise<SurveyExtractionEnvelope> {
  // Keep current values/ownership, but never upload a growing audit or full transcript.
  const context = selectSurveyContext(survey, segment.index, 6);
  const recent = [...context.segments];
  const snapshot: Survey = {
    ...survey,
    transcripts: [...recent, segment],
    processedSegmentIds: survey.processedSegmentIds.slice(-100),
    audit: [],
    conflicts: [],
    uncertainties: [],
    notes: [],
  };
  let body = JSON.stringify({ survey: snapshot, segment });
  while (
    new TextEncoder().encode(body).byteLength > 50_000 &&
    recent.some((item) => !context.anchorIds.includes(item.id))
  ) {
    recent.splice(
      recent.findIndex((item) => !context.anchorIds.includes(item.id)),
      1,
    );
    snapshot.transcripts = [...recent, segment];
    body = JSON.stringify({ survey: snapshot, segment });
  }
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
