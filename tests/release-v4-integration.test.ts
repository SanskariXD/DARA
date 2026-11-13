import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  completeSurvey,
  createRainySurveyFromPrior,
  createSurvey,
  type Survey,
  type SurveyExtractionEnvelope,
  type SurveyTranscript,
} from "../src/lib/survey";
import { decodeProviderWire } from "../src/lib/server/live-providers";
import { createSurveyRepository } from "../src/lib/survey-db";

const now = "2026-11-14T09:00:00.000Z";
type Field = { fieldId: string; value: string; evidence: string };
type Proof = {
  kind: "introduction" | "name" | "relationship" | "context";
  reference: string;
  evidence: string;
  segmentId: string;
};
type WireMember = {
  memberId: string | null;
  slot: number | null;
  fields: Field[];
  evidence: string;
  uncertain: boolean;
  attribution: Proof;
  corrections: never[];
};
const databases: ReturnType<typeof createSurveyRepository>[] = [];
const databaseNames: string[] = [];

afterEach(async () => {
  databases.splice(0).forEach((db) => db.close());
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

const field = (fieldId: string, value: string, evidence: string): Field => ({
  fieldId,
  value,
  evidence,
});
function segment(
  index: number,
  text: string,
  language: "en" | "kn" = "en",
): SurveyTranscript {
  return {
    id: `fresh-${index}`,
    index,
    text,
    timestamp: now,
    source: "manual",
    language,
  };
}
function wire(
  members: WireMember[] = [],
  householdFields: Field[] = [],
  familySize: number | null = null,
  familySizeEvidence: string | null = null,
) {
  return {
    familySize,
    familySizeEvidence,
    familySizeCorrection: null,
    members,
    householdFields,
    notes: [],
    uncertainties: [],
  };
}
function member(
  slot: number,
  source: SurveyTranscript,
  reference: string,
  proof: string,
  fields: Field[],
  kind: Proof["kind"] = "introduction",
  memberId: string | null = null,
): WireMember {
  return {
    memberId,
    slot,
    fields,
    evidence: source.text,
    uncertain: false,
    attribution: { kind, reference, evidence: proof, segmentId: source.id },
    corrections: [],
  };
}
function apply(
  survey: Survey,
  source: SurveyTranscript,
  response: ReturnType<typeof wire>,
  mode: "live" | "reconcile" = "live",
) {
  const input = survey.transcripts.some((item) => item.id === source.id)
    ? survey
    : addSurveyTranscript(survey, source, now);
  const result = decodeProviderWire(response, input, source);
  const envelope: SurveyExtractionEnvelope = {
    surveyId: input.id,
    baseRevision: input.revision,
    segmentId: source.id,
    segmentIndex: source.index,
    result,
    ...(mode === "reconcile" ? { mode: "reconcile" as const } : {}),
  };
  return mode === "reconcile"
    ? applySurveyReconciliation(input, envelope, [], now)
    : applySurveyExtraction(input, envelope, [], now);
}
async function freshVisit() {
  const name = `dara-v4-independent-${crypto.randomUUID()}`;
  const db = createSurveyRepository(name, { seedExamples: false });
  databases.push(db);
  databaseNames.push(name);
  const workspace = await db.loadWorkspace();
  const home = {
    id: "new-qa-home",
    label: "New QA household",
    code: "QA-NEW",
    address: "Synthetic address",
    createdAt: now,
    workspaceGeneration: workspace.generation,
  };
  await db.saveHousehold(home);
  const survey = createSurvey(
    { householdId: home.id, workspaceGeneration: workspace.generation },
    now,
    "new-qa-visit",
  );
  await db.saveSurvey(survey);
  expect(survey.members).toHaveLength(0);
  return { survey, db };
}

describe("v0.4 independent fresh-entry regression", () => {
  for (const language of ["en", "kn"] as const) {
    for (const kind of ["introduction", "name"] as const) {
      it(`persists ${language} health and household notes from an empty visit when provider proof is ${kind}`, async () => {
        const { survey, db } = await freshVisit();
        const fixture =
          language === "en"
            ? {
                count: "There are two people in our family.",
                name: "QA Latha",
                introduction: "My name is QA Latha.",
                age: "I am 32 years old.",
                health: "I have a headache and I take tablets for BP.",
                note: "Our drinking water comes from the shared tap.",
              }
            : {
                count: "ನಮ್ಮ ಕುಟುಂಬದಲ್ಲಿ ಇಬ್ಬರು ಇದ್ದೇವೆ.",
                name: "ಪರೀಕ್ಷಾ ಲತಾ",
                introduction: "ನನ್ನ ಹೆಸರು ಪರೀಕ್ಷಾ ಲತಾ.",
                age: "ನನಗೆ 32 ವರ್ಷ.",
                health: "ನನಗೆ ತಲೆನೋವು ಇದೆ ಮತ್ತು ಬಿಪಿಗೆ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತೇನೆ.",
                note: "ನಾವು ಸಾರ್ವಜನಿಕ ನಲ್ಲಿಯಿಂದ ಕುಡಿಯುವ ನೀರನ್ನು ತರುತ್ತೇವೆ.",
              };
        const source = segment(
          0,
          Object.values(fixture)
            .filter((_, index) => index !== 1)
            .join(" "),
          language,
        );
        const extracted = apply(
          survey,
          source,
          wire(
            [
              member(
                1,
                source,
                fixture.name,
                fixture.introduction,
                [
                  field("name", fixture.name, fixture.introduction),
                  field("age", "32", fixture.age),
                  field("healthStatus", "concerns", fixture.health),
                  field("healthHistory", fixture.health, fixture.health),
                  field("hypertension", "yes", fixture.health),
                ],
                kind,
              ),
            ],
            [field("householdNotes", fixture.note, fixture.note)],
            2,
            fixture.count,
          ),
        );
        expect(extracted.members).toHaveLength(2);
        expect(extracted.members[0].values).toMatchObject({
          name: fixture.name,
          age: 32,
          healthStatus: "concerns",
          healthHistory: fixture.health,
          hypertension: "yes",
        });
        expect(extracted.members[1].values.healthHistory).toBeUndefined();
        expect(extracted.household.values.householdNotes).toBe(fixture.note);
        expect(extracted.uncertainties).toHaveLength(0);
        await db.saveSurvey(extracted);
        const restored = (await db.loadWorkspace()).surveys.find(
          (visit) => visit.id === survey.id,
        )!;
        expect(restored.members[0].values.healthHistory).toBe(fixture.health);
        expect(restored.household.values.householdNotes).toBe(fixture.note);
      });
    }
  }

  it("recovers missing health from a repeated same-person introduction without replacing existing identity", async () => {
    const { survey } = await freshVisit();
    const source = segment(
      0,
      "There are two people. My name is QA Meena. I am 29. I have had a cough for two days.",
    );
    const first = apply(
      survey,
      source,
      wire(
        [
          member(1, source, "QA Meena", "My name is QA Meena.", [
            field("name", "QA Meena", "My name is QA Meena."),
            field("age", "29", "I am 29."),
          ]),
        ],
        [],
        2,
        "There are two people.",
      ),
    );
    const recovered = apply(
      first,
      source,
      wire([
        member(
          1,
          source,
          "QA Meena",
          "My name is QA Meena.",
          [
            field("name", "QA Meena", "My name is QA Meena."),
            field(
              "healthStatus",
              "concerns",
              "I have had a cough for two days.",
            ),
            field(
              "healthHistory",
              "I have had a cough for two days.",
              "I have had a cough for two days.",
            ),
          ],
          "introduction",
          first.members[0].id,
        ),
      ]),
      "reconcile",
    );
    expect(recovered.members[0].values.name).toBe("QA Meena");
    expect(recovered.members[0].values.healthHistory).toBe(
      "I have had a cough for two days.",
    );
    expect(recovered.members[1].values.healthHistory).toBeUndefined();
  });

  it("keeps household facts when no family member can be identified", async () => {
    const { survey, db } = await freshVisit();
    const source = segment(
      0,
      "We collect drinking water from the village tap. Please visit this household after 4 pm.",
    );
    const extracted = apply(
      survey,
      source,
      wire([], [field("householdNotes", source.text, source.text)]),
    );
    expect(extracted.members).toHaveLength(0);
    expect(extracted.household.values.householdNotes).toBe(source.text);
    await db.saveSurvey(extracted);
    expect(
      (await db.loadWorkspace()).surveys[0].household.values.householdNotes,
    ).toBe(source.text);
  });

  for (const language of ["en", "kn"] as const) {
    it(`applies a uniquely identified ${language} husband report to the existing spouse record`, async () => {
      const { survey } = await freshVisit();
      const initial = segment(
        0,
        "There are two people. I am QA Latha. My husband is QA Ravi.",
      );
      const first = apply(
        survey,
        initial,
        wire(
          [
            member(1, initial, "QA Latha", "I am QA Latha.", [
              field("name", "QA Latha", "I am QA Latha."),
              field("relation", "self", "I am QA Latha."),
            ]),
            member(2, initial, "QA Ravi", "My husband is QA Ravi.", [
              field("name", "QA Ravi", "My husband is QA Ravi."),
              field("relation", "spouse", "My husband is QA Ravi."),
            ]),
          ],
          [],
          2,
          "There are two people.",
        ),
      );
      expect(first.members[1].values.relation).toBe("spouse");
      const source = segment(
        1,
        language === "en" ? "My husband has a fever." : "ನನ್ನ ಗಂಡನಿಗೆ ಜ್ವರ ಇದೆ.",
        language,
      );
      const result = apply(
        first,
        source,
        wire([
          member(
            2,
            source,
            language === "en" ? "husband" : "ಗಂಡ",
            source.text,
            [
              field("healthStatus", "concerns", source.text),
              field("healthHistory", source.text, source.text),
            ],
            "relationship",
            first.members[1].id,
          ),
        ]),
      );
      expect(result.members[1].values.healthHistory).toBe(source.text);
      expect(result.members[0].values.healthHistory).toBeUndefined();
    });
  }

  it("does not let a prior person's quote override the person currently introduced before a pronoun answer", async () => {
    const { survey } = await freshVisit();
    const initial = segment(
      0,
      "There are two people. His name is QA Ravi. Her name is QA Sita.",
    );
    const first = apply(
      survey,
      initial,
      wire(
        [
          member(1, initial, "QA Ravi", "His name is QA Ravi.", [
            field("name", "QA Ravi", "His name is QA Ravi."),
          ]),
          member(2, initial, "QA Sita", "Her name is QA Sita.", [
            field("name", "QA Sita", "Her name is QA Sita."),
          ]),
        ],
        [],
        2,
        "There are two people.",
      ),
    );
    const source = segment(
      1,
      "I am now asking QA Sita about her health. She has a fever.",
    );
    const wrong = member(
      1,
      source,
      "QA Ravi",
      "His name is QA Ravi.",
      [
        field("healthStatus", "concerns", "She has a fever."),
        field("healthHistory", "She has a fever.", "She has a fever."),
      ],
      "context",
      first.members[0].id,
    );
    wrong.attribution.segmentId = initial.id;
    const rejected = apply(first, source, wire([wrong]));
    expect(rejected.members[0].values.healthHistory).toBeUndefined();
    expect(rejected.uncertainties.length).toBeGreaterThan(0);
    const valid = apply(
      first,
      source,
      wire([
        member(
          2,
          source,
          "QA Sita",
          "I am now asking QA Sita about her health.",
          [field("healthHistory", "She has a fever.", "She has a fever.")],
          "context",
          first.members[1].id,
        ),
      ]),
    );
    expect(valid.members[1].values.healthHistory).toBe("She has a fever.");
    expect(valid.members[0].values.healthHistory).toBeUndefined();
  });

  it.each([
    "I have an MCP card.",
    "We will discuss the MCP card next visit.",
    "Have you discussed the MCP card?",
    "The worker never discussed the MCP card.",
    "ನನ್ನ ಬಳಿ ತಾಯಿ ಮತ್ತು ಮಗು ರಕ್ಷಣಾ ಕಾರ್ಡ್ ಇದೆ.",
    "ನಾಳೆ ಕಾರ್ಡ್ ಬಗ್ಗೆ ವಿವರಿಸಬೇಕು.",
  ])(
    "does not mark counselling done from a mention, plan, question or denial: %s",
    async (quote) => {
      const { survey } = await freshVisit();
      const source = segment(
        0,
        `There is one person. My name is QA Mother. I am pregnant. ${quote}`,
      );
      const result = apply(
        survey,
        source,
        wire(
          [
            member(1, source, "QA Mother", "My name is QA Mother.", [
              field("name", "QA Mother", "My name is QA Mother."),
              field("pregnancyStatus", "yes", "I am pregnant."),
              field("careMcpDiscussed", "done", quote),
            ]),
          ],
          [],
          1,
          "There is one person.",
        ),
      );
      expect(result.members[0].values.careMcpDiscussed).not.toBe("done");
      expect(result.uncertainties.length).toBeGreaterThan(0);
    },
  );

  it.each([
    "We discussed how to use the MCP card at antenatal visits.",
    "ನಾವು ತಾಯಿ ಮತ್ತು ಮಗು ರಕ್ಷಣಾ ಕಾರ್ಡ್ ಬಗ್ಗೆ ಚರ್ಚಿಸಿದ್ದೇವೆ.",
    "Please bring your mother card to the antenatal visit.",
  ])(
    "records actual completed counselling without inventing a vaccine: %s",
    async (quote) => {
      const { survey } = await freshVisit();
      const source = segment(
        0,
        `There is one person. My name is QA Mother. I am 26. I am five months pregnant. I received two injections. ${quote}`,
      );
      const result = apply(
        survey,
        source,
        wire(
          [
            member(1, source, "QA Mother", "My name is QA Mother.", [
              field("name", "QA Mother", "My name is QA Mother."),
              field("age", "26", "I am 26."),
              field("pregnancyStatus", "yes", "I am five months pregnant."),
              field("pregnancyMonths", "5", "I am five months pregnant."),
              field(
                "pregnancyInjectionCount",
                "2",
                "I received two injections.",
              ),
              field(
                "pregnancyInjections",
                "two injections",
                "I received two injections.",
              ),
              field("careMcpDiscussed", "done", quote),
            ]),
          ],
          [],
          1,
          "There is one person.",
        ),
      );
      expect(result.members[0].values).toMatchObject({
        pregnancyStatus: "yes",
        pregnancyMonths: 5,
        pregnancyInjectionCount: 2,
        pregnancyInjections: "I received two injections.",
        careMcpDiscussed: "done",
      });
      expect(JSON.stringify(result.members[0].values)).not.toMatch(
        /tetanus|\bTT\b|\bTd\b/,
      );
    },
  );

  it("uses one household phone and carries only identity into a rainy visit, preserving completed history", async () => {
    const { survey, db } = await freshVisit();
    expect(
      survey.fields
        .filter(
          (item) =>
            !item.legacy && ["phone", "householdPhone"].includes(item.id),
        )
        .map((item) => [item.id, item.scope]),
    ).toEqual([["householdPhone", "household"]]);
    expect(
      survey.fields.find((item) => item.id === "weight" && !item.legacy)
        ?.section,
    ).toBe("health");
    const initial = segment(
      0,
      "There is one person. My name is QA Ravi. I am 40. I have a cough. I weigh 61 kg. Our phone number is 9876543210. The tap is repaired.",
    );
    const extracted = apply(
      survey,
      initial,
      wire(
        [
          member(1, initial, "QA Ravi", "My name is QA Ravi.", [
            field("name", "QA Ravi", "My name is QA Ravi."),
            field("age", "40", "I am 40."),
            field("healthStatus", "concerns", "I have a cough."),
            field("healthHistory", "I have a cough.", "I have a cough."),
            field("weight", "61", "I weigh 61 kg."),
          ]),
        ],
        [
          field(
            "householdPhone",
            "9876543210",
            "Our phone number is 9876543210.",
          ),
          field(
            "householdNotes",
            "The tap is repaired.",
            "The tap is repaired.",
          ),
        ],
        1,
        "There is one person.",
      ),
    );
    const completed = completeSurvey(extracted, now);
    await db.completeSurvey(completed);
    const rainy = createRainySurveyFromPrior(
      {
        householdId: completed.householdId,
        priorSurvey: completed,
        workspaceGeneration: completed.workspaceGeneration,
      },
      now,
      "qa-rainy",
    );
    expect(rainy.templateId).toBe("rainy-season");
    expect(rainy.members[0].values).toMatchObject({ name: "QA Ravi", age: 40 });
    expect(rainy.members[0].values.healthHistory).toBeUndefined();
    expect(rainy.members[0].values.weight).toBeUndefined();
    expect(rainy.household.values.householdPhone).toBe("9876543210");
    expect(rainy.household.values.householdNotes).toBeUndefined();
    const current = segment(
      0,
      "There is stagnant water beside our house. I explained removing standing water to the household.",
    );
    const filled = apply(
      rainy,
      current,
      wire(
        [],
        [
          field(
            "stagnantWater",
            "yes",
            "There is stagnant water beside our house.",
          ),
          field(
            "waterLocations",
            "beside the house",
            "There is stagnant water beside our house.",
          ),
          field(
            "rainyWaterDiscussed",
            "done",
            "I explained removing standing water to the household.",
          ),
        ],
      ),
    );
    expect(filled.household.values).toMatchObject({
      stagnantWater: "yes",
      rainyWaterDiscussed: "done",
    });
    await db.saveSurvey(filled);
    const saved = (await db.loadWorkspace()).surveys;
    expect(
      saved.find((item) => item.id === completed.id)?.members[0].values
        .healthHistory,
    ).toBe("I have a cough.");
    expect(
      saved.find((item) => item.id === rainy.id)?.household.values
        .rainyWaterDiscussed,
    ).toBe("done");
  });

  it.each([
    ["rainyFeverDiscussed", "Does anyone have fever or cold?"],
    ["rainyWaterDiscussed", "Empty and scrub plant saucers; cover containers."],
  ])(
    "records an actual delivered topic inquiry or advice for %s",
    async (fieldId, quote) => {
      const { survey } = await freshVisit();
      const rainy = createRainySurveyFromPrior(
        {
          householdId: survey.householdId,
          workspaceGeneration: survey.workspaceGeneration,
        },
        now,
        `rainy-${fieldId}`,
      );
      const source = segment(0, quote);
      const result = apply(
        rainy,
        source,
        wire([], [field(fieldId, "done", quote)]),
      );
      expect(result.household.values[fieldId]).toBe("done");
      expect(result.members).toHaveLength(0);
      expect(result.household.values.stagnantWater).toBeUndefined();
    },
  );

  it("does not guess between two records compatible with a spoken spouse relationship", async () => {
    const { survey } = await freshVisit();
    const source = segment(
      0,
      "There are two people. My partner is QA Arun. My husband is QA Ravi.",
    );
    const first = apply(
      survey,
      source,
      wire(
        [
          member(1, source, "QA Arun", "My partner is QA Arun.", [
            field("name", "QA Arun", "My partner is QA Arun."),
            field("relation", "spouse", "My partner is QA Arun."),
          ]),
          member(2, source, "QA Ravi", "My husband is QA Ravi.", [
            field("name", "QA Ravi", "My husband is QA Ravi."),
            field("relation", "husband", "My husband is QA Ravi."),
          ]),
        ],
        [],
        2,
        "There are two people.",
      ),
    );
    const report = segment(1, "My husband has a fever.");
    const result = apply(
      first,
      report,
      wire([
        member(
          2,
          report,
          "husband",
          report.text,
          [field("healthHistory", report.text, report.text)],
          "relationship",
          first.members[1].id,
        ),
      ]),
    );
    expect(
      result.members.every(
        (person) => person.values.healthHistory === undefined,
      ),
    ).toBe(true);
    expect(result.uncertainties.length).toBeGreaterThan(0);
  });

  it("replays the real synthetic pregnancy wire: delivered ASHA guidance counts, patient appointment does not", async () => {
    const { survey, db } = await freshVisit();
    const introduction = segment(
      0,
      "There is one person. My name is Anjali. I am 28.",
    );
    const identified = apply(
      survey,
      introduction,
      wire(
        [
          member(1, introduction, "Anjali", "My name is Anjali.", [
            field("name", "Anjali", "My name is Anjali."),
            field("age", "28", "I am 28."),
          ]),
        ],
        [],
        1,
        "There is one person.",
      ),
    );
    const source = segment(
      1,
      "Anjali is five months pregnant. ASHA: Do you have your MCP card? Anjali: Yes, I have the card. Anjali: I received one injection, but I do not know its name. ASHA: Include a variety of foods and take your prescribed supplements. ASHA: We will discuss injections at the next visit. Anjali: My next antenatal appointment is on 20 December at the village PHC.",
    );
    const pregnancy = "Anjali is five months pregnant.";
    const injection =
      "Anjali: I received one injection, but I do not know its name.";
    const appointment =
      "Anjali: My next antenatal appointment is on 20 December at the village PHC.";
    const proposal = member(
      1,
      source,
      "Anjali",
      pregnancy,
      [
        field("pregnancyStatus", "yes", pregnancy),
        field("pregnancyMonths", "5", pregnancy),
        field("maternalStage", "pregnant", pregnancy),
        field("mcpCardStatus", "has-card", "Anjali: Yes, I have the card."),
        field(
          "pregnancyInjections",
          "I received one injection, but I do not know its name.",
          injection,
        ),
        field("pregnancyInjectionCount", "1", injection),
        field("nextCareVisit", "20 December", appointment),
        field("careFacility", "village PHC", appointment),
        field("careMcpDiscussed", "done", "ASHA: Do you have your MCP card?"),
        field(
          "careNutritionDiscussed",
          "done",
          "ASHA: Include a variety of foods and take your prescribed supplements.",
        ),
        field("careAncDiscussed", "done", appointment),
      ],
      "name",
      identified.members[0].id,
    );
    // Keep the model's narrow enclosing quote exactly as returned; each field
    // still carries its own original passage rather than a generated summary.
    proposal.evidence = pregnancy;
    const result = apply(identified, source, wire([proposal]));
    expect(result.members[0].values).toMatchObject({
      pregnancyMonths: 5,
      pregnancyInjectionCount: 1,
      pregnancyInjections: injection,
      careMcpDiscussed: "done",
      careNutritionDiscussed: "done",
      nextCareVisit: "20 December",
      careFacility: "village PHC",
    });
    expect(result.members[0].values.careAncDiscussed).toBeUndefined();
    expect(result.members[0].values.careInjectionsDiscussed).toBeUndefined();
    expect(result.uncertainties).toHaveLength(1);
    await db.saveSurvey(result);
    const saved = (await db.loadWorkspace()).surveys[0];
    expect(saved.members[0].values.careNutritionDiscussed).toBe("done");
    expect(saved.members[0].values.pregnancyInjections).toBe(injection);
  });
});
