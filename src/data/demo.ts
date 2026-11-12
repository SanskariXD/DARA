import type {
  FieldId,
  FieldValue,
  Household,
  PatchChange,
  TranscriptSegment,
} from "../lib/types";

export interface DemoStep {
  segment: TranscriptSegment;
  changes: PatchChange[];
}

/** Explicit sample conversation fixtures. This is not STT or LLM output. */
export function getDemoSegments(
  visitId: string,
  household: Household,
): DemoStep[] {
  const primary = household.members[0];
  if (!primary) return [];
  const husband = household.members.find(
    (member) => member.relation.toLowerCase() === "husband",
  );
  const other =
    husband ??
    household.members.find((member) => member.id !== primary.id) ??
    primary;
  const subject = husband
    ? "My husband"
    : other.id === primary.id
      ? "I"
      : other.name;
  const pregnancy =
    primary.sex === "female" && primary.age >= 18 && primary.age <= 45;
  const now = Date.now();
  const steps: Array<{
    memberId: string;
    text: string;
    values: Array<[FieldId, FieldValue, ("set" | "append")?]>;
  }> = [
    {
      memberId: primary.id,
      text: `ASHA: Could you confirm your name and age? ${primary.name}: My name is ${primary.name}. I am ${primary.age} years old.`,
      values: [
        ["name", primary.name],
        ["age", primary.age],
      ],
    },
    {
      memberId: primary.id,
      text: `ASHA: Are you having any symptoms? ${primary.name}: I have no symptoms to report today.`,
      values: [["symptoms", "No symptoms to report today."]],
    },
    {
      memberId: primary.id,
      text: `${primary.name}: My weight is 58 kilograms.`,
      values: [["weight", 58]],
    },
    {
      memberId: primary.id,
      text: `${primary.name}: Please correct my weight. It is 59 kilograms, not 58.`,
      values: [["weight", 59]],
    },
    {
      memberId: other.id,
      text: `${primary.name}: ${subject} ${other.id === primary.id ? "have" : "has"} been having fever for a week.`,
      values: [
        ["feverDays", 7],
        [
          "symptoms",
          `${subject} ${other.id === primary.id ? "have" : "has"} been having fever for a week.`,
          "append",
        ],
      ],
    },
    {
      memberId: primary.id,
      text: pregnancy
        ? `${primary.name}: I am pregnant, and I am twenty weeks along.`
        : `${primary.name}: I would like the next visit to be in the morning.`,
      values: pregnancy
        ? [
            ["pregnancyStatus", "yes"],
            ["pregnancyWeeks", 20],
          ]
        : [["notes", "Next visit preferred in the morning.", "append"]],
    },
    {
      memberId: primary.id,
      text: `${primary.name}: Please note that the family is usually available after 10 in the morning.`,
      values: [
        [
          "notes",
          "Family is usually available after 10 in the morning.",
          "append",
        ],
      ],
    },
  ];
  return steps.map((step, index) => ({
    segment: {
      id: `${visitId}-sample-${index + 1}`,
      index,
      text: step.text,
      timestamp: new Date(now + index * 1000).toISOString(),
      memberId: step.memberId,
      language: "en",
      source: "demo",
    },
    changes: step.values.map(([field, value, operation]) => ({
      memberId: step.memberId,
      field,
      value,
      evidence: step.text,
      operation: operation ?? "set",
    })),
  }));
}
