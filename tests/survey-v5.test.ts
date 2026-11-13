import { decodeProviderWire } from "../src/lib/server/live-providers";
import { describe, expect, it } from "vitest";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  canRepairSurveyField,
  confirmCarriedIdentities,
  createFollowUpSurvey,
  createSurvey,
  editSurveyField,
  ensurePregnancyFollowUpSuggestion,
  getSurveyDiscourseContext,
  isPregnancyFollowUpEligible,
  reviewSurvey,
  surveySchema,
  type Survey,
  type SurveyExtractionEnvelope,
} from "../src/lib/survey";
const NOW = "2026-11-13T12:00:00.000Z";
const INTRO =
  "My name is Ajay. I am the husband, so I will be telling about my wife. My wife's name is Anisha. My wife is 20.";
const FOLLOW =
  "My age is 21. So recently, I have been experiencing some health issues like, I have been having fever since a week. I am experiencing difficulty in breathing also.";
function start() {
  let s = createSurvey({ householdId: "home" }, NOW, "s");
  s = editSurveyField(s, null, "familySize", 2, NOW);
  s = editSurveyField(s, s.members[0].id, "name", "Ajay", NOW);
  s = editSurveyField(s, s.members[0].id, "relation", "self", NOW);
  s = editSurveyField(s, s.members[1].id, "name", "Anisha", NOW);
  s = editSurveyField(s, s.members[1].id, "relation", "wife", NOW);
  for (const [index, text] of [INTRO, FOLLOW].entries())
    s = addSurveyTranscript(
      s,
      {
        id: `t${index}`,
        index,
        text,
        timestamp: NOW,
        language: "en",
        source: "gnani",
      },
      NOW,
    );
  return s;
}
function proposal(
  s: Survey,
  fieldId: string,
  value: string | number,
  evidence: string,
  repairs = false,
): SurveyExtractionEnvelope {
  return {
    surveyId: s.id,
    segmentId: "t1",
    segmentIndex: 1,
    baseRevision: s.revision,
    result: {
      familySize: null,
      notes: [],
      members: [
        {
          memberId: s.members[0].id,
          [fieldId]: value,
          evidence,
          fieldEvidence: { [fieldId]: evidence },
          attribution: {
            kind: "context",
            reference: "Ajay",
            evidence: "My name is Ajay.",
            segmentId: "t0",
          },
          ...(repairs
            ? {
                corrections: [
                  {
                    fieldId,
                    previousValue: s.members[0].values[fieldId] ?? null,
                    evidence,
                    kind: "reconciliation" as const,
                  },
                ],
              }
            : {}),
        },
      ],
    },
  };
}
function machine(
  s: Survey,
  index: number,
  fieldId: string,
  value: string | number,
  evidence: string,
  segmentIndex = 1,
): Survey {
  return {
    ...s,
    members: s.members.map((m, i) =>
      i !== index
        ? m
        : {
            ...m,
            values: { ...m.values, [fieldId]: value },
            meta: {
              ...m.meta,
              [fieldId]: {
                source: "extracted",
                revision: s.revision,
                segmentIndex,
                segmentId: `t${segmentIndex}`,
                manuallyProtected: false,
                evidence,
              },
            },
          },
    ),
  };
}
describe("durable respondent and machine-only repair", () => {
  it("applies the exact browser sequence when a second Kannada speaker introduces a new name", () => {
    let s = createSurvey({ householdId: "home" }, NOW, "bilingual");
    const sources = [
      {
        name: "Extracted Fixture Person",
        intro: "My name is Extracted Fixture Person.",
        health: "I have a headache and I have BP.",
        note: "The household prefers morning visits.",
        prefix: "There are three family members. ",
        language: "en" as const,
      },
      {
        name: "ಪರೀಕ್ಷಾ ರವಿ",
        intro: "ನನ್ನ ಹೆಸರು ಪರೀಕ್ಷಾ ರವಿ.",
        health: "ನನಗೆ ಎರಡು ದಿನದಿಂದ ಕೆಮ್ಮು ಇದೆ.",
        note: "ನಾವು ನಲ್ಲಿಯಿಂದ ಕುಡಿಯುವ ನೀರು ತರುತ್ತೇವೆ.",
        prefix: "",
        language: "kn" as const,
      },
    ];
    for (const [index, source] of sources.entries()) {
      const segment = {
        id: `browser-${index}`,
        index,
        text: `${source.prefix}${source.intro} ${source.health} ${source.note}`,
        timestamp: NOW,
        source: "gnani" as const,
        language: source.language,
      };
      s = addSurveyTranscript(s, segment, NOW);
      const result = decodeProviderWire(
        {
          familySize: index === 0 ? 3 : null,
          familySizeEvidence:
            index === 0 ? "There are three family members." : null,
          familySizeCorrection: null,
          members: [
            {
              memberId: null,
              slot: index + 1,
              evidence: segment.text,
              uncertain: false,
              attribution: {
                kind: "name",
                reference: source.name,
                evidence: source.intro,
                segmentId: segment.id,
              },
              corrections: [],
              fields: [
                { fieldId: "name", value: source.name, evidence: source.intro },
                {
                  fieldId: "healthStatus",
                  value: "concerns",
                  evidence: source.health,
                },
                {
                  fieldId: "healthHistory",
                  value: source.health,
                  evidence: source.health,
                },
                ...(index === 0
                  ? [
                      {
                        fieldId: "hypertension",
                        value: "yes",
                        evidence: source.health,
                      },
                    ]
                  : []),
              ],
            },
          ],
          householdFields: [
            {
              fieldId: "householdNotes",
              value: source.note,
              evidence: source.note,
            },
          ],
          notes: [],
          uncertainties: [],
        },
        s,
        segment,
      );
      s = applySurveyExtraction(s, {
        surveyId: s.id,
        segmentId: segment.id,
        segmentIndex: index,
        baseRevision: s.revision,
        result,
      });
    }
    expect(s.members[0].values).toMatchObject({
      name: sources[0].name,
      healthHistory: sources[0].health,
      hypertension: "yes",
    });
    expect(s.members[1].values).toMatchObject({
      name: sources[1].name,
      healthHistory: sources[1].health,
      healthStatus: "concerns",
    });
    expect(s.members[2].values).toEqual({});
    expect(s.uncertainties).toEqual([]);
    expect(s.household.values.householdNotes).toBe(
      `${sources[0].note}\n${sources[1].note}`,
    );
    expect(getSurveyDiscourseContext(s).respondentMemberId).toBe(
      s.members[1].id,
    );
    expect(getSurveyDiscourseContext(s).discussedMemberId).toBe(
      s.members[1].id,
    );
  });
  it("keeps Ajay as respondent while wife remains the discussed subject", () => {
    const context = getSurveyDiscourseContext(start());
    expect(context.respondentMemberId).toBe(start().members[0].id);
    expect(context.discussedMemberId).toBe(start().members[1].id);
    expect(context.respondentAnchor?.evidence).toBe("My name is Ajay.");
  });
  it("does not make a named wife the respondent from a speaker's husband role in the same sentence", () => {
    const s = start();
    const source = {
      ...s,
      transcripts: [
        {
          ...s.transcripts[0],
          text: "I am the husband and my wife's name is Anisha.",
        },
      ],
    };
    expect(getSurveyDiscourseContext(source).respondentMemberId).toBe(
      s.members[0].id,
    );
    expect(getSurveyDiscourseContext(source).respondentMemberId).not.toBe(
      s.members[1].id,
    );
  });
  it("accepts actual filler-rich first-person fever then breathing reports", () => {
    let s = start();
    const evidence =
      "So recently, I have been experiencing some health issues like, I have been having fever since a week.";
    s = applySurveyExtraction(s, proposal(s, "feverDays", 7, evidence));
    expect(s.members[0].values.feverDays).toBe(7);
    expect(s.members[1].values.feverDays).toBeUndefined();
  });
  it("repairs a wrong machine value from its original source without requiring spoken correction words", () => {
    let s = machine(start(), 0, "age", 20, "My age is 21.");
    s = applySurveyReconciliation(
      s,
      proposal(s, "age", 21, "My age is 21.", true),
    );
    expect(s.members[0].values.age).toBe(21);
    expect(s.conflicts.filter((c) => !c.resolved)).toEqual([]);
  });
  it("clears only the wrong member's exact machine copy and lets an earlier source refill it", () => {
    let s = machine(start(), 1, "age", 21, "My age is 21.");
    s = applySurveyReconciliation(s, proposal(s, "age", 21, "My age is 21."));
    expect(s.members[0].values.age).toBe(21);
    expect(s.members[1].values.age).toBeNull();
    expect(s.members[1].meta.age.segmentIndex).toBe(-1);
    const restored = applySurveyReconciliation(s, {
      surveyId: s.id,
      segmentId: "t0",
      segmentIndex: 0,
      baseRevision: s.revision,
      result: {
        familySize: null,
        notes: [],
        members: [
          {
            memberId: s.members[1].id,
            age: 20,
            evidence: "My wife is 20.",
            attribution: {
              kind: "relationship",
              reference: "wife",
              evidence: "My wife is 20.",
              segmentId: "t0",
            },
          },
        ],
      },
    });
    expect(restored.members[1].values.age).toBe(20);
  });
  it("cleans an obsolete wrong copy even if the true target already has the same answer", () => {
    let s = machine(
      machine(start(), 0, "age", 21, "My age is 21."),
      1,
      "age",
      21,
      "My age is 21.",
    );
    s = applySurveyReconciliation(s, proposal(s, "age", 21, "My age is 21."));
    expect(s.members[0].values.age).toBe(21);
    expect(s.members[1].values.age).toBeNull();
  });
  it("does not resurrect a repaired wrong-person copy when the original live extraction arrives late", () => {
    const before = machine(start(), 1, "age", 21, "My age is 21.");
    const late = {
      ...proposal(before, "age", 21, "My age is 21."),
      result: {
        familySize: null,
        notes: [],
        members: [
          {
            memberId: before.members[1].id,
            age: 21,
            evidence: "My age is 21.",
            attribution: {
              kind: "context" as const,
              reference: "Anisha",
              evidence: "My wife's name is Anisha.",
              segmentId: "t0",
            },
          },
        ],
      },
    };
    const repaired = applySurveyReconciliation(
      before,
      proposal(before, "age", 21, "My age is 21."),
    );
    const after = applySurveyExtraction(repaired, late);
    expect(after.members[0].values.age).toBe(21);
    expect(after.members[1].values.age).toBeNull();
    expect(
      after.conflicts.some(
        (conflict) =>
          !conflict.resolved && conflict.memberId === after.members[1].id,
      ),
    ).toBe(false);
  });
  it("repairs Kannada wife relationship and derived sex using the uniquely named source even when the old relationship is wrong", () => {
    let s = createSurvey({ householdId: "home" }, NOW, "kn");
    s = editSurveyField(s, null, "familySize", 2, NOW);
    s = editSurveyField(s, s.members[0].id, "name", "ಅಜಯ್", NOW);
    s = editSurveyField(s, s.members[0].id, "relation", "self", NOW);
    s = editSurveyField(s, s.members[1].id, "name", "ಅನಿಷಾ", NOW);
    const text = "ನನ್ನ ಹೆಸರು ಅಜಯ್. ನನ್ನ ಹೆಂಡತಿಯ ಹೆಸರು ಅನಿಷಾ. ನನ್ನ ಹೆಂಡತಿಯ ವಯಸ್ಸು 20 ವರ್ಷ.";
    s = addSurveyTranscript(
      s,
      {
        id: "kn0",
        index: 0,
        text,
        timestamp: NOW,
        language: "kn",
        source: "gnani",
      },
      NOW,
    );
    s = {
      ...s,
      members: s.members.map((member, index) =>
        index !== 1
          ? member
          : {
              ...member,
              values: { ...member.values, relation: "husband", sex: "male" },
              meta: {
                ...member.meta,
                relation: {
                  source: "extracted",
                  revision: s.revision,
                  segmentIndex: 0,
                  segmentId: "kn0",
                  manuallyProtected: false,
                  evidence: text,
                },
                sex: {
                  source: "extracted",
                  revision: s.revision,
                  segmentIndex: 0,
                  segmentId: "kn0",
                  manuallyProtected: false,
                  evidence: text,
                },
              },
            },
      ),
    };
    const fixed = applySurveyReconciliation(s, {
      surveyId: s.id,
      segmentId: "kn0",
      segmentIndex: 0,
      baseRevision: s.revision,
      result: {
        familySize: null,
        notes: [],
        members: [
          {
            memberId: s.members[1].id,
            relation: "wife",
            sex: "female",
            evidence: "ನನ್ನ ಹೆಂಡತಿಯ ಹೆಸರು ಅನಿಷಾ. ನನ್ನ ಹೆಂಡತಿಯ ವಯಸ್ಸು 20 ವರ್ಷ.",
            fieldEvidence: { relation: "ನನ್ನ ಹೆಂಡತಿ", sex: "ನನ್ನ ಹೆಂಡತಿಯ" },
            attribution: {
              kind: "relationship",
              reference: "ಹೆಂಡತಿ",
              evidence: "ನನ್ನ ಹೆಂಡತಿಯ ಹೆಸರು ಅನಿಷಾ.",
              segmentId: "kn0",
            },
            corrections: [
              {
                fieldId: "relation",
                previousValue: "husband",
                evidence: "ನನ್ನ ಹೆಂಡತಿಯ ಹೆಸರು ಅನಿಷಾ.",
                kind: "reconciliation",
              },
              {
                fieldId: "sex",
                previousValue: "male",
                evidence: "ನನ್ನ ಹೆಂಡತಿಯ ಹೆಸರು ಅನಿಷಾ.",
                kind: "reconciliation",
              },
            ],
          },
        ],
      },
    });
    expect(fixed.members[1].values.relation).toBe("wife");
    expect(fixed.members[1].values.sex).toBe("female");
    expect(fixed.uncertainties).toEqual([]);
  });
  it("does not clear a manual or focused wrong-member answer", () => {
    let s = machine(start(), 1, "age", 21, "My age is 21.");
    s = editSurveyField(s, s.members[1].id, "age", 21, NOW);
    s = applySurveyReconciliation(s, proposal(s, "age", 21, "My age is 21."));
    expect(s.members[1].values.age).toBe(21);
    let focused = machine(start(), 1, "age", 21, "My age is 21.");
    focused = applySurveyReconciliation(
      focused,
      proposal(focused, "age", 21, "My age is 21."),
      [`${focused.members[1].id}.age`],
    );
    expect(focused.members[1].values.age).toBe(21);
  });
  it("rejects stale, manual, focused, and completed machine repair proposals", () => {
    const base = machine(start(), 0, "age", 20, "My age is 21.");
    const e = proposal(base, "age", 21, "My age is 21.", true);
    const manual = editSurveyField(base, base.members[0].id, "age", 22, NOW);
    expect(applySurveyReconciliation(manual, e).members[0].values.age).toBe(22);
    expect(
      applySurveyReconciliation(base, e, [`${base.members[0].id}.age`])
        .members[0].values.age,
    ).toBe(20);
    expect(canRepairSurveyField(base, base.members[0].id, "age", 0)).toBe(
      false,
    );
    const completed = {
      ...base,
      status: "completed" as const,
      completedAt: NOW,
    };
    expect(applySurveyReconciliation(completed, e)).toBe(completed);
  });
  it("retires the resolved source attribution question while retaining unrelated concerns", () => {
    let s = start();
    s = {
      ...s,
      uncertainties: [
        {
          id: "old",
          message:
            "The conversation moved to another person after this reference.",
          evidence: "My age is 21.",
          memberId: s.members[0].id,
          segmentId: "t1",
          resolved: false,
        },
        {
          id: "other",
          message: "Check an unspecified measurement unit.",
          evidence: "My age is 21.",
          memberId: s.members[0].id,
          segmentId: "t1",
          resolved: false,
        },
      ],
    };
    s = applySurveyReconciliation(s, proposal(s, "age", 21, "My age is 21."));
    expect(s.uncertainties.map((u) => u.resolved)).toEqual([true, false]);
  });
});
describe("follow-up identity and editable planning suggestions", () => {
  it("copies only identities/contact for general visits and requires confirmation", () => {
    let prior = start();
    prior = editSurveyField(prior, null, "householdPhone", "9876543210", NOW);
    prior = editSurveyField(
      prior,
      prior.members[0].id,
      "healthHistory",
      "fever",
      NOW,
    );
    const next = createFollowUpSurvey(
      { householdId: "home", priorSurvey: prior, kind: "family" },
      NOW,
      "repeat",
    );
    expect(next.members[0].values.healthHistory).toBeUndefined();
    expect(next.members[0].meta.name.carriedFromSurveyId).toBe(prior.id);
    expect(next.household.meta.householdPhone.carriedFromSurveyId).toBe(
      prior.id,
    );
    expect(next.identityReviewRequired).toBe(true);
    expect(
      reviewSurvey(next).some((i) => i.fieldId === "identityReviewRequired"),
    ).toBe(true);
    expect(confirmCarriedIdentities(next, NOW).identityReviewRequired).toBe(
      false,
    );
    expect(surveySchema.safeParse(next).success).toBe(true);
  });
  it("gates pregnancy followups and carries care facts but resets counselling and suggested visit dates", () => {
    let prior = start();
    expect(isPregnancyFollowUpEligible(prior)).toBe(false);
    expect(() =>
      createFollowUpSurvey({
        householdId: "home",
        priorSurvey: prior,
        kind: "pregnancy",
      }),
    ).toThrow();
    const id = prior.members[1].id;
    prior = editSurveyField(prior, id, "pregnancyStatus", "yes", NOW);
    prior = editSurveyField(prior, id, "pregnancyMonths", 2, NOW);
    prior = editSurveyField(prior, id, "careMcpDiscussed", "done", NOW);
    prior = editSurveyField(prior, id, "nextCareVisit", "2026-11-20", NOW);
    const next = createFollowUpSurvey(
      { householdId: "home", priorSurvey: prior, kind: "pregnancy" },
      "2026-12-01T12:00:00.000Z",
      "preg-repeat",
    );
    expect(next.members[1].values.pregnancyMonths).toBe(2);
    expect(next.members[1].values.careMcpDiscussed).toBeUndefined();
    expect(next.members[1].values.nextCareVisit).toBe("2026-12-15");
    expect(next.members[1].meta.nextCareVisit.carriedValue).toBe("2026-11-20");
    expect(next.members[1].meta.nextCareVisit.suggested).toBe(true);
    expect(ensurePregnancyFollowUpSuggestion(next)).toBe(next);
  });
  it("never restores manually cleared dates and removes only automatic suggestions after pregnancy ends", () => {
    let s = start(),
      id = s.members[1].id;
    s = editSurveyField(s, id, "pregnancyStatus", "yes", NOW);
    expect(s.members[1].values.nextCareVisit).toBe("2026-11-27");
    const ended = editSurveyField(s, id, "pregnancyStatus", "no", NOW);
    expect(ended.members[1].values.nextCareVisit).toBeNull();
    const manual = editSurveyField(s, id, "nextCareVisit", "2026-12-03", NOW);
    expect(
      editSurveyField(manual, id, "pregnancyStatus", "no", NOW).members[1]
        .values.nextCareVisit,
    ).toBe("2026-12-03");
    const cleared = editSurveyField(s, id, "nextCareVisit", null, NOW);
    expect(ensurePregnancyFollowUpSuggestion(cleared)).toBe(cleared);
  });
});
