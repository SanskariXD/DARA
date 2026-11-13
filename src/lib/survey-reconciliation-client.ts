import { selectSurveyContext } from "./survey-context";
import { z } from "zod";
import {
  applySurveyReconciliation,
  surveyExtractionSchema,
  type Survey,
  type SurveyTranscript,
  type SurveyExtractionEnvelope,
} from "./survey";

export type ReconciliationResponse = {
  surveyId: string;
  baseRevision: number;
  checkedSegmentIds: string[];
  envelopes: SurveyExtractionEnvelope[];
};

const responseSchema = z
  .object({
    surveyId: z.string(),
    baseRevision: z.number().int().nonnegative(),
    checkedSegmentIds: z.array(z.string()).max(12),
    envelopes: z
      .array(
        z
          .object({
            surveyId: z.string(),
            segmentId: z.string(),
            segmentIndex: z.number().int().nonnegative(),
            baseRevision: z.number().int().nonnegative(),
            mode: z.literal("reconcile"),
            result: surveyExtractionSchema,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

/** Newest batches first: an older statement cannot fill a gap ahead of its correction. */
export function reconciliationBatches(
  segments: SurveyTranscript[],
): SurveyTranscript[][] {
  const batches: SurveyTranscript[][] = [];
  let current: SurveyTranscript[] = [],
    chars = 0;
  for (const segment of [...segments].sort((a, b) => b.index - a.index)) {
    if (
      current.length &&
      (current.length >= 12 || chars + segment.text.length > 16000)
    ) {
      batches.push(current.reverse());
      current = [];
      chars = 0;
    }
    current.push(segment);
    chars += segment.text.length;
  }
  if (current.length) batches.push(current.reverse());
  return batches;
}

export function reconciliationRequest(
  survey: Survey,
  segments: SurveyTranscript[],
): string {
  const first = Math.min(...segments.map((item) => item.index));
  const context = selectSurveyContext(survey, first, 2);
  const prior = [...context.segments];
  const snapshot: Survey = {
    ...survey,
    transcripts: [...prior, ...segments],
    processedSegmentIds: [],
    audit: [],
    conflicts: [],
    uncertainties: [],
    notes: [],
  };
  let body = JSON.stringify({ survey: snapshot, segments });
  // Context passages are optional. Keep the original target passages intact,
  // and drop optional context first when UTF-8 Indic text approaches the cap.
  while (
    new TextEncoder().encode(body).byteLength > 256000 &&
    prior.some((segment) => !context.anchorIds.includes(segment.id))
  ) {
    prior.splice(
      prior.findIndex((segment) => !context.anchorIds.includes(segment.id)),
      1,
    );
    snapshot.transcripts = [...prior, ...segments];
    body = JSON.stringify({ survey: snapshot, segments });
  }
  return body;
}

export async function reconcileSurveyBatch(
  survey: Survey,
  segments: SurveyTranscript[],
  signal?: AbortSignal,
): Promise<ReconciliationResponse> {
  const body = reconciliationRequest(survey, segments);
  if (new TextEncoder().encode(body).byteLength > 256000)
    throw new Error(
      "This conversation needs a smaller review batch. Your records are unchanged.",
    );
  let response: Response;
  try {
    response = await fetch("/api/reconcile", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(40000)])
        : AbortSignal.timeout(40000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "The conversation check could not finish. Retry when connected, or review the unanswered questions yourself.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error?.message === "string"
        ? data.error.message
        : "The conversation check could not finish. Please try again.",
    );
  const parsed = responseSchema.safeParse(data);
  const expected = new Set(segments.map((item) => item.id));
  if (
    !parsed.success ||
    parsed.data.surveyId !== survey.id ||
    parsed.data.baseRevision !== survey.revision ||
    new Set(parsed.data.checkedSegmentIds).size !== expected.size ||
    parsed.data.checkedSegmentIds.length !== expected.size ||
    parsed.data.checkedSegmentIds.some((id) => !expected.has(id)) ||
    new Set(parsed.data.envelopes.map((item) => item.segmentId)).size !==
      parsed.data.envelopes.length ||
    parsed.data.envelopes.some(
      (item) =>
        item.surveyId !== survey.id ||
        item.baseRevision !== survey.revision ||
        !segments.some(
          (segment) =>
            segment.id === item.segmentId &&
            segment.index === item.segmentIndex,
        ),
    )
  )
    throw new Error(
      "The conversation check did not match this visit. Your current answers were kept.",
    );
  return parsed.data;
}

/** Run only inside the UI's serialized latest-record mutation authority. A response
 * may rebase over unrelated edits, but never cross a visit/reset or edited source. */
export function applyReconciliationBatch(
  current: Survey,
  requested: Survey,
  response: ReconciliationResponse,
  protectedKeys: string[] = [],
): Survey {
  if (
    current.id !== requested.id ||
    current.workspaceGeneration !== requested.workspaceGeneration ||
    current.status !== "draft" ||
    current.revision < requested.revision ||
    response.surveyId !== requested.id ||
    response.baseRevision !== requested.revision
  )
    return current;
  for (const id of response.checkedSegmentIds) {
    const original = requested.transcripts.find((segment) => segment.id === id);
    const latest = current.transcripts.find((segment) => segment.id === id);
    if (
      !original ||
      !latest ||
      JSON.stringify(original) !== JSON.stringify(latest)
    )
      return current;
  }
  let next = current;
  for (const envelope of [...response.envelopes].sort(
    (a, b) => b.segmentIndex - a.segmentIndex,
  )) {
    if (
      envelope.surveyId !== requested.id ||
      envelope.baseRevision !== requested.revision ||
      !response.checkedSegmentIds.includes(envelope.segmentId)
    )
      return current;
    next = applySurveyReconciliation(next, envelope, protectedKeys);
  }
  return next;
}

const hashes = new WeakMap<SurveyTranscript, string>();
function textHash(segment: SurveyTranscript) {
  const saved = hashes.get(segment);
  if (saved) return saved;
  let hash = 2166136261;
  for (let i = 0; i < segment.text.length; i++)
    hash = Math.imul(hash ^ segment.text.charCodeAt(i), 16777619);
  const value = `${segment.id}:${segment.index}:${segment.text.length}:${hash >>> 0}`;
  hashes.set(segment, value);
  return value;
}
export function surveyRosterFingerprint(survey: Survey) {
  return JSON.stringify([
    survey.household.values.familySize,
    ...survey.members.map((member) => [
      member.id,
      member.values.name,
      member.values.relation,
      member.values.sex,
    ]),
  ]);
}
export function surveyFieldFingerprint(survey: Survey) {
  // Labels and options affect what the model can recover, including custom questions.
  return JSON.stringify(survey.fields);
}
export function surveyAnswerFingerprint(survey: Survey) {
  const record = (answer: Survey["household"]) => [
    answer.values,
    Object.fromEntries(
      Object.entries(answer.meta).map(([id, meta]) => {
        const { revision: _revision, ...ownership } = meta;
        return [id, ownership];
      }),
    ),
  ];
  return JSON.stringify([
    record(survey.household),
    ...survey.members.map((member) => [member.id, record(member)]),
  ]);
}
export function surveyConversationFingerprint(survey: Survey) {
  return `${survey.id}:${survey.workspaceGeneration ?? ""}:${survey.templateId}:${survey.templateVersion}:${survey.identityReviewRequired ?? false}:${surveyFieldFingerprint(survey)}:${surveyRosterFingerprint(survey)}:${surveyAnswerFingerprint(survey)}:${survey.transcripts.map(textHash).join("|")}`;
}
