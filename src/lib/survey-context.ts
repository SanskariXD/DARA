import type { Survey, SurveyTranscript } from "./survey";
import { getSurveyDiscourseContext } from "./survey-discourse";
import {
  containsIdentityReference,
  mentionedRelationships,
  relationshipsCompatible,
} from "./survey-relations";

/** Keep exact original identity passages when a long conversation outgrows the
 * recent-context window. Required anchors must not be silently byte-trimmed. */
export function selectSurveyContext(
  survey: Survey,
  beforeIndex: number,
  limit: number,
): { segments: SurveyTranscript[]; anchorIds: string[] } {
  const earlier = survey.transcripts
    .filter((segment) => segment.index < beforeIndex)
    .sort((a, b) => a.index - b.index);
  const context = getSurveyDiscourseContext(survey, beforeIndex - 1);
  const selected: SurveyTranscript[] = [];
  const anchorIds: string[] = [];
  const add = (segment: SurveyTranscript | undefined, anchor: boolean) => {
    if (
      !segment ||
      selected.some((item) => item.id === segment.id) ||
      selected.length >= limit
    )
      return;
    selected.push(segment);
    if (anchor) anchorIds.push(segment.id);
  };
  add(
    earlier.find(
      (segment) => segment.id === context.respondentAnchor?.segmentId,
    ),
    true,
  );
  const discussed = survey.members.find(
    (member) => member.id === context.discussedMemberId,
  );
  if (discussed)
    add(
      earlier.findLast(
        (segment) =>
          (typeof discussed.values.name === "string" &&
            containsIdentityReference(segment.text, discussed.values.name)) ||
          mentionedRelationships(segment.text).some(
            (relation) =>
              relation !== "self" &&
              relationshipsCompatible(
                String(discussed.values.relation ?? ""),
                relation,
              ),
          ),
      ),
      true,
    );
  for (const segment of [...earlier].reverse()) add(segment, false);
  return { segments: selected.sort((a, b) => a.index - b.index), anchorIds };
}
