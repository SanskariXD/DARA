import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  editSurveyField,
  completeSurvey,
  createFollowUpSurvey,
  confirmCarriedIdentities,
  ensurePregnancyFollowUpSuggestion,
  isPregnancyFollowUpEligible,
  reviewSurvey,
  createSurvey,
  type Survey,
  type SurveyTranscript,
} from "../src/lib/survey";
import { decodeProviderWire } from "../src/lib/server/live-providers";
import { createSurveyRepository } from "../src/lib/survey-db";

const now = "2026-11-14T10:00:00.000Z";
const repos: ReturnType<typeof createSurveyRepository>[] = [];
const dbNames: string[] = [];
afterEach(async () => {
  repos.splice(0).forEach((repo) => repo.close());
  await Promise.all(dbNames.splice(0).map((name) => Dexie.delete(name)));
});
function passage(index: number, text: string): SurveyTranscript {
  return {
    id: `ajay-${index}`,
    index,
    text,
    timestamp: now,
    source: "manual",
    language: "en",
  };
}
type Field = { fieldId: string; value: string; evidence: string };
const field = (fieldId: string, value: string, evidence: string): Field => ({
  fieldId,
  value,
  evidence,
});
function proposal(
  survey: Survey,
  slot: number,
  source: SurveyTranscript,
  fields: Field[],
  reference: string,
  proof: SurveyTranscript,
  proofQuote = proof.text,
  kind = "context",
) {
  return {
    memberId: survey.members[slot - 1]?.id ?? null,
    slot,
    fields,
    evidence: source.text,
    uncertain: false,
    attribution: { kind, reference, evidence: proofQuote, segmentId: proof.id },
    corrections: [],
  };
}
function extract(
  survey: Survey,
  source: SurveyTranscript,
  members: ReturnType<typeof proposal>[],
  familySize: number | null = null,
) {
  const current = addSurveyTranscript(survey, source, now);
  const result = decodeProviderWire(
    {
      familySize,
      familySizeEvidence:
        familySize === null ? null : "There are two family members.",
      familySizeCorrection: null,
      members,
      householdFields: [],
      notes: [],
      uncertainties: [],
    },
    current,
    source,
  );
  return applySurveyExtraction(
    current,
    {
      surveyId: current.id,
      baseRevision: current.revision,
      segmentId: source.id,
      segmentIndex: source.index,
      result,
    },
    [],
    now,
  );
}
async function start() {
  const dbName = `dara-v5-qa-${crypto.randomUUID()}`;
  const repo = createSurveyRepository(dbName, { seedExamples: false });
  repos.push(repo);
  dbNames.push(dbName);
  const workspace = await repo.loadWorkspace();
  await repo.saveHousehold({
    id: "ajay-home",
    label: "Synthetic Ajay household",
    code: "QA-05",
    address: "Fictional test address",
    createdAt: now,
    workspaceGeneration: workspace.generation,
  });
  const survey = createSurvey(
    { householdId: "ajay-home", workspaceGeneration: workspace.generation },
    now,
    "ajay-visit",
  );
  await repo.saveSurvey(survey);
  return { repo, survey };
}
async function introduceCouple(wrongWifeSex = false) {
  const { repo, survey } = await start();
  const ajay = passage(
    0,
    "There are two family members. My name is Ajay. I am the husband.",
  );
  let current = extract(
    survey,
    ajay,
    [
      proposal(
        survey,
        1,
        ajay,
        [
          field("name", "Ajay", "My name is Ajay."),
          field("relation", "self", "My name is Ajay."),
          field("sex", "male", "I am the husband."),
        ],
        "Ajay",
        ajay,
        "My name is Ajay.",
        "introduction",
      ),
    ],
    2,
  );
  await repo.saveSurvey(current);
  const wife = passage(1, "My wife's name is Anisha. Her age is 20.");
  current = extract(current, wife, [
    proposal(
      current,
      2,
      wife,
      [
        field("name", "Anisha", "My wife's name is Anisha."),
        field("relation", "wife", "My wife's name is Anisha."),
        field("age", "20", "Her age is 20."),
        ...(wrongWifeSex
          ? [field("sex", "male", "My wife's name is Anisha.")]
          : []),
      ],
      "Anisha",
      wife,
      "My wife's name is Anisha.",
      "introduction",
    ),
  ]);
  await repo.saveSurvey(current);
  return { repo, survey: current, ajay, wife };
}

describe("v0.5 exact respondent and persistence regressions", () => {
  it("keeps My age, week-long fever and first-person breathlessness with Ajay after he discusses his wife", async () => {
    const started = await introduceCouple();
    let survey = started.survey;
    const age = passage(2, "My age is 21.");
    survey = extract(survey, age, [
      proposal(
        survey,
        1,
        age,
        [field("age", "21", age.text)],
        "Ajay",
        started.ajay,
        "My name is Ajay.",
      ),
    ]);
    await started.repo.saveSurvey(survey);
    const fever = passage(3, "I have fever since a week.");
    survey = extract(survey, fever, [
      proposal(
        survey,
        1,
        fever,
        [
          field("healthStatus", "concerns", fever.text),
          field("healthHistory", fever.text, fever.text),
          field("feverDays", "7", fever.text),
        ],
        "Ajay",
        started.ajay,
        "My name is Ajay.",
      ),
    ]);
    await started.repo.saveSurvey(survey);
    const breath = passage(
      4,
      "I am experiencing difficulty in breathing also.",
    );
    survey = extract(survey, breath, [
      proposal(
        survey,
        1,
        breath,
        [
          field("healthHistory", breath.text, breath.text),
          field("breathingDifficulty", "yes", breath.text),
        ],
        "Ajay",
        started.ajay,
        "My name is Ajay.",
      ),
    ]);
    await started.repo.saveSurvey(survey);
    const saved = (await started.repo.loadWorkspace()).surveys[0];
    expect(saved.members[0].values).toMatchObject({
      name: "Ajay",
      relation: "self",
      sex: "male",
      age: 21,
      feverDays: 7,
      breathingDifficulty: "yes",
      healthHistory: `${fever.text}\n${breath.text}`,
    });
    expect(saved.members[1].values).toMatchObject({
      name: "Anisha",
      relation: "wife",
      sex: "female",
      age: 20,
    });
    expect(saved.members[1].values.healthHistory).toBeUndefined();
    expect(saved.uncertainties).toHaveLength(0);
  });

  it("rejects a model's first-person age proposal for Anisha despite a valid older name quote", async () => {
    const { survey, ajay, wife } = await introduceCouple();
    const age = passage(2, "My age is 21.");
    const wrong = extract(survey, age, [
      proposal(
        survey,
        2,
        age,
        [field("age", "21", age.text)],
        "Anisha",
        wife,
        "My wife's name is Anisha.",
        "name",
      ),
    ]);
    expect(wrong.members[1].values.age).toBe(20);
    expect([undefined, 21]).toContain(wrong.members[0].values.age);
    expect(
      wrong.conflicts.some(
        (item) =>
          !item.resolved &&
          item.memberId === survey.members[1].id &&
          item.fieldId === "age" &&
          item.proposedValue === 21,
      ),
    ).toBe(false);
    expect(ajay.text).toContain("My name is Ajay.");
  });

  it("does not carry the husband's sex into the wife from a quote that only says wife", async () => {
    const { survey } = await introduceCouple(true);
    expect(survey.members[1].values.relation).toBe("wife");
    expect(survey.members[1].values.sex).toBe("female");
    expect(survey.members[0].values.sex).toBe("male");
  });

  it.each(["machine", "manual", "focused"] as const)(
    "repairs a machine-only scalar mistake while respecting %s ownership",
    async (ownership) => {
      const { survey, ajay, repo } = await introduceCouple();
      const age = passage(2, "My age is 21.");
      const input = addSurveyTranscript(survey, age, now);
      const damaged = structuredClone(input);
      damaged.members[0].values.age = 22;
      damaged.members[0].meta.age = {
        source: "extracted",
        revision: input.revision,
        segmentIndex: age.index,
        segmentId: age.id,
        evidence: age.text,
        manuallyProtected: false,
      };
      let candidate =
        ownership === "manual"
          ? editSurveyField(damaged, damaged.members[0].id, "age", 23, now)
          : damaged;
      await repo.saveSurvey(candidate);
      const wire = proposal(
        candidate,
        1,
        age,
        [field("age", "21", age.text)],
        "Ajay",
        ajay,
        "My name is Ajay.",
      );
      const result = decodeProviderWire(
        {
          familySize: null,
          familySizeEvidence: null,
          familySizeCorrection: null,
          members: [
            {
              ...wire,
              corrections: [
                {
                  fieldId: "age",
                  kind: "reconciliation",
                  previousValue: ownership === "manual" ? 23 : 22,
                  evidence: age.text,
                },
              ],
            },
          ],
          householdFields: [],
          notes: [],
          uncertainties: [],
        },
        candidate,
        age,
      );
      const repaired = applySurveyReconciliation(
        candidate,
        {
          surveyId: candidate.id,
          baseRevision: candidate.revision,
          segmentId: age.id,
          segmentIndex: age.index,
          mode: "reconcile",
          result,
        },
        ownership === "focused" ? [`${candidate.members[0].id}.age`] : [],
        now,
      );
      expect(repaired.members[0].values.age).toBe(
        ownership === "machine" ? 21 : ownership === "manual" ? 23 : 22,
      );
      expect(repaired.members[1].values.age).toBe(20);
      await repo.saveSurvey(repaired);
      expect(
        (await repo.loadWorkspace()).surveys[0].members[0].values.age,
      ).toBe(repaired.members[0].values.age);
    },
  );

  it.each([false, true])(
    "moves a proven wrong-person machine copy but preserves manual copies (manual=%s)",
    async (protectedCopy) => {
      const { survey, ajay } = await introduceCouple();
      const fever = passage(2, "I have fever since a week.");
      const input = addSurveyTranscript(survey, fever, now);
      const damaged = structuredClone(input);
      damaged.members[1].values.healthHistory = fever.text;
      damaged.members[1].meta.healthHistory = {
        source: "extracted",
        revision: input.revision,
        segmentIndex: fever.index,
        segmentId: fever.id,
        evidence: fever.text,
        manuallyProtected: false,
      };
      damaged.uncertainties.push({
        id: "old-attribution-warning",
        message:
          "The conversation moved to another person after this reference. Confirm the member for the follow-up.",
        evidence: fever.text,
        memberId: damaged.members[0].id,
        segmentId: fever.id,
        resolved: false,
      });
      const current = protectedCopy
        ? editSurveyField(
            damaged,
            damaged.members[1].id,
            "healthHistory",
            fever.text,
            now,
          )
        : damaged;
      const result = decodeProviderWire(
        {
          familySize: null,
          familySizeEvidence: null,
          familySizeCorrection: null,
          members: [
            proposal(
              current,
              1,
              fever,
              [
                field("healthHistory", fever.text, fever.text),
                field("healthStatus", "concerns", fever.text),
                field("feverDays", "7", fever.text),
              ],
              "Ajay",
              ajay,
              "My name is Ajay.",
            ),
          ],
          householdFields: [],
          notes: [],
          uncertainties: [],
        },
        current,
        fever,
      );
      const repaired = applySurveyReconciliation(
        current,
        {
          surveyId: current.id,
          baseRevision: current.revision,
          segmentId: fever.id,
          segmentIndex: fever.index,
          mode: "reconcile",
          result,
        },
        [],
        now,
      );
      expect(repaired.members[0].values.healthHistory).toBe(fever.text);
      expect(repaired.members[1].values.healthHistory).toBe(
        protectedCopy ? fever.text : null,
      );
      expect(
        repaired.uncertainties.find(
          (item) => item.id === "old-attribution-warning",
        )?.resolved,
      ).toBe(true);
      expect(
        reviewSurvey(repaired).some(
          (issue) => issue.id === "old-attribution-warning",
        ),
      ).toBe(false);
    },
  );

  it("gates pregnancy follow-up, suggests an editable date fourteen days ahead and carries identity with fresh general health", async () => {
    const { survey, repo } = await introduceCouple();
    expect(isPregnancyFollowUpEligible(survey)).toBe(false);
    expect(() =>
      createFollowUpSurvey(
        {
          householdId: survey.householdId,
          priorSurvey: survey,
          kind: "pregnancy",
        },
        now,
      ),
    ).toThrow(/confirmed pregnancy/i);
    let current = editSurveyField(survey, survey.members[0].id, "age", 21, now);
    current = editSurveyField(
      current,
      current.members[1].id,
      "pregnancyStatus",
      "yes",
      now,
    );
    current = editSurveyField(
      current,
      current.members[1].id,
      "pregnancyMonths",
      5,
      now,
    );
    current = editSurveyField(
      current,
      current.members[1].id,
      "mcpCardStatus",
      "has-card",
      now,
    );
    current = editSurveyField(
      current,
      current.members[1].id,
      "careMcpDiscussed",
      "done",
      now,
    );
    current = editSurveyField(
      current,
      current.members[0].id,
      "healthHistory",
      "Synthetic old fever report",
      now,
    );
    current = ensurePregnancyFollowUpSuggestion(current, now);
    expect(current.members[1].values.nextCareVisit).toBe("2026-11-28");
    const customDate = editSurveyField(
      current,
      current.members[1].id,
      "nextCareVisit",
      "2026-12-03",
      now,
    );
    expect(
      ensurePregnancyFollowUpSuggestion(customDate, now).members[1].values
        .nextCareVisit,
    ).toBe("2026-12-03");
    const cleared = editSurveyField(
      customDate,
      customDate.members[1].id,
      "nextCareVisit",
      null,
      now,
    );
    expect(
      ensurePregnancyFollowUpSuggestion(cleared, now).members[1].values
        .nextCareVisit,
    ).toBeNull();
    const completed = completeSurvey(customDate, now);
    await repo.completeSurvey(completed);
    const repeat = createFollowUpSurvey(
      {
        householdId: completed.householdId,
        priorSurvey: completed,
        kind: "family",
        workspaceGeneration: completed.workspaceGeneration,
      },
      "2026-12-01T10:00:00.000Z",
      "general-repeat",
    );
    expect(repeat.identityReviewRequired).toBe(true);
    expect(repeat.members.map((member) => member.values.name)).toEqual([
      "Ajay",
      "Anisha",
    ]);
    expect(repeat.members[0].values.healthHistory).toBeUndefined();
    expect(repeat.members[1].values.pregnancyStatus).toBeUndefined();
    expect(
      reviewSurvey(repeat).some((issue) =>
        /confirm.*household|household.*confirm/i.test(issue.message),
      ),
    ).toBe(true);
    expect(confirmCarriedIdentities(repeat, now).identityReviewRequired).toBe(
      false,
    );
    const followup = createFollowUpSurvey(
      {
        householdId: completed.householdId,
        priorSurvey: completed,
        kind: "pregnancy",
        workspaceGeneration: completed.workspaceGeneration,
      },
      "2026-12-01T10:00:00.000Z",
      "pregnancy-followup",
    );
    expect(followup.members[1].values).toMatchObject({
      name: "Anisha",
      pregnancyStatus: "yes",
      pregnancyMonths: 5,
      mcpCardStatus: "has-card",
      nextCareVisit: "2026-12-15",
    });
    expect(followup.members[1].meta.mcpCardStatus.carriedFromSurveyId).toBe(
      completed.id,
    );
    expect(followup.members[1].values.careMcpDiscussed).toBeUndefined();
    expect(followup.members[0].values.healthHistory).toBeUndefined();
    await repo.saveSurvey(followup);
    expect(
      (await repo.loadWorkspace()).surveys.find(
        (item) => item.id === completed.id,
      )?.members[1].values.nextCareVisit,
    ).toBe("2026-12-03");
  });
});
