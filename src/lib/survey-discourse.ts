import type { Survey, SurveyTranscript } from "./survey";
import {
  containsIdentityReference,
  mentionedRelationships,
  normalizeIdentityText,
  normalizeRelationship,
  relationshipsCompatible,
} from "./survey-relations";
export interface SurveyDiscourseContext {
  respondentMemberId: string | null;
  respondentAnchor: {
    segmentId: string;
    evidence: string;
    reference: string;
  } | null;
  discussedMemberId: string | null;
  ambiguous: boolean;
}
const workerLine = /^\s*(?:asha|anm|health worker|worker|nurse|ಆಶಾ|आशा)\s*:/iu;
export function isFirstPersonSurveyAnswer(text: string): boolean {
  if (workerLine.test(text)) return false;
  const clean = text.replace(/^\s*[^:：.!?]{1,50}[:：]\s*/u, "").trim();
  const first = clean.search(
    /\bi(?:['’](?:m|ve))?\s+(?:am|have|feel|experience|was|need)|\bmy\s+(?:age|name|health|temperature|weight|blood pressure|symptoms?)\b/iu,
  );
  if (
    first >= 0 &&
    !/["“”]|\b(?:says?|said|told|wife|husband|mother|father|daughter|son|she|he)\b/iu.test(
      clean.slice(0, first),
    )
  )
    return true;
  return /^(?:i\b|i['’]m\b|i['’]ve\b|my\s+(?:age|name|health|temperature|weight|blood pressure|symptoms?)\b)|(?:^|[.!?]\s*)(?:ನನ್ನ (?:ವಯಸ್ಸು|ಹೆಸರು|ಆರೋಗ್ಯ)|ನನಗೆ|ನಾನು|मेरा नाम|मेरी उम्र|मुझे|मैं)/iu.test(
    clean,
  );
}
function explicitMembers(survey: Survey, text: string): string[] {
  const named = survey.members.filter(
    (member) =>
      typeof member.values.name === "string" &&
      containsIdentityReference(text, member.values.name),
  );
  if (named.length) return named.map((member) => member.id);
  const relations = mentionedRelationships(text).filter(
    (relation) => relation !== "self",
  );
  return survey.members
    .filter((member) =>
      relations.some((relation) =>
        relationshipsCompatible(String(member.values.relation ?? ""), relation),
      ),
    )
    .map((member) => member.id);
}
/** Respondent identity survives discussion of relatives; first-person reports return to that respondent. */
export function getSurveyDiscourseContext(
  survey: Survey,
  throughIndex = Infinity,
  throughOffset?: number,
): SurveyDiscourseContext {
  let respondentMemberId: string | null = null,
    respondentAnchor: SurveyDiscourseContext["respondentAnchor"] = null,
    discussedMemberId: string | null = null,
    ambiguous = false;
  for (const segment of [...survey.transcripts]
    .filter((item) => item.index <= throughIndex)
    .sort((a, b) => a.index - b.index)) {
    const text =
      segment.index === throughIndex && throughOffset != null
        ? segment.text.slice(0, throughOffset)
        : segment.text;
    for (const raw of text.split(/(?<=[.!?।])\s+|\n/u)) {
      const clause = raw.trim();
      if (!clause || workerLine.test(clause)) continue;
      const names = survey.members.filter(
        (member) =>
          typeof member.values.name === "string" &&
          containsIdentityReference(clause, member.values.name),
      );
      const selfNames = names.filter((member) => {
        const source = normalizeIdentityText(clause),
          name = normalizeIdentityText(String(member.values.name));
        const before = source.slice(0, source.indexOf(name));
        return /(?:my name is|i am(?: called| named)?|i['’]m|ನನ್ನ ಹೆಸರು|मेरा नाम(?: है)?)\s*$/iu.test(
          before,
        );
      });
      const namedSpeaker = survey.members.filter(
        (member) =>
          typeof member.values.name === "string" &&
          normalizeIdentityText(clause).startsWith(
            `${normalizeIdentityText(member.values.name)}:`,
          ),
      );
      const intro = selfNames.length ? selfNames : namedSpeaker;
      if (intro.length === 1) {
        respondentMemberId = intro[0].id;
        respondentAnchor = {
          segmentId: segment.id,
          evidence: clause,
          reference: String(intro[0].values.name),
        };
        ambiguous = false;
        if (!discussedMemberId) discussedMemberId = respondentMemberId;
      } else if (intro.length > 1) {
        respondentMemberId = null;
        respondentAnchor = null;
        ambiguous = true;
      }
      if (isFirstPersonSurveyAnswer(clause)) continue;
      const candidates = explicitMembers(survey, clause);
      if (candidates.length === 1) discussedMemberId = candidates[0];
      else if (candidates.length > 1) discussedMemberId = null;
    }
  }
  // A worker-entered self relationship is a durable identity choice, not a name/sex guess.
  if (!respondentMemberId && !ambiguous) {
    const selves = survey.members.filter(
      (member) =>
        normalizeRelationship(String(member.values.relation ?? "")) === "self",
    );
    if (selves.length === 1) respondentMemberId = selves[0].id;
  }
  return { respondentMemberId, respondentAnchor, discussedMemberId, ambiguous };
}
export function resolveSurveyEvidenceSubject(
  survey: Survey,
  segment: SurveyTranscript,
  evidence: string,
): { memberId: string | null; firstPerson: boolean; ambiguous: boolean } {
  const index = segment.text.indexOf(evidence);
  const context = getSurveyDiscourseContext(
    survey,
    segment.index,
    index < 0 ? undefined : index + evidence.length,
  );
  const firstPerson = isFirstPersonSurveyAnswer(evidence);
  if (firstPerson)
    return {
      memberId: context.respondentMemberId,
      firstPerson: true,
      ambiguous: context.ambiguous,
    };
  const explicit = explicitMembers(survey, evidence);
  if (explicit.length === 1)
    return { memberId: explicit[0], firstPerson: false, ambiguous: false };
  if (explicit.length > 1)
    return { memberId: null, firstPerson: false, ambiguous: true };
  return {
    memberId: context.discussedMemberId,
    firstPerson: false,
    ambiguous: false,
  };
}
/** A named possessive relation belongs to the named relative, not the speaker's preceding role. */
export function relationshipForNamedPerson(
  text: string,
  name: string,
): string | null {
  if (!name) return null;
  const escaped = normalizeIdentityText(name).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const source = normalizeIdentityText(text).replace(/’/gu, "'");
  const found = source.match(
    new RegExp(
      `(?:my|our)\\s+(wife|husband|mother|father|son|daughter|brother|sister)(?:'s)?\\s+(?:(?:name is|name's|is|named|called)\\s+)?${escaped}(?:$|[^\\p{L}\\p{M}])`,
      "u",
    ),
  );
  if (found) return normalizeRelationship(found[1]);
  for (const clause of source.split(/[.!?।]/u)) {
    if (
      !containsIdentityReference(clause, name) ||
      isFirstPersonSurveyAnswer(clause)
    )
      continue;
    const relations = mentionedRelationships(clause).filter(
      (value) => value !== "self",
    );
    if (relations.length === 1) return relations[0];
  }
  return null;
}
