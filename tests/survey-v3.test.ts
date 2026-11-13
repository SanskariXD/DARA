import { describe, expect, it } from "vitest";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  canAppendSurveyNarrative,
  completeSurvey,
  createRainySurveyFromPrior,
  createSurvey,
  editSurveyField,
  hasCompletedCounsellingEvidence,
  isSurveyFieldVisible,
  migrateDraftSurvey,
  normalizeRelationship,
  reviewSurvey,
  surveySchema,
  type Survey,
  type SurveyExtractionResult,
  type SurveyTranscript,
} from "../src/lib/survey";
const NOW = "2026-11-13T16:00:00.000Z";
const fresh = (kind: "family" | "pregnancy" | "rainy" = "family") =>
  createSurvey({ householdId: "home", kind }, NOW, "v3");
const proof = (
  index: number,
  reference: string,
  evidence: string,
  kind: "name" | "relationship" | "introduction" | "context" = "name",
) => ({ kind, reference, evidence, segmentId: `t-${index}` });
function send(
  s: Survey,
  text: string,
  result: Partial<SurveyExtractionResult>,
  mode: "live" | "reconcile" = "live",
  index = s.transcripts.length,
) {
  const segment: SurveyTranscript = {
    id: `t-${index}`,
    index,
    text,
    timestamp: NOW,
    source: "gnani",
    language: "auto",
  };
  if (!s.transcripts.some((t) => t.id === segment.id))
    s = addSurveyTranscript(s, segment);
  const envelope = {
    surveyId: s.id,
    segmentId: segment.id,
    segmentIndex: index,
    baseRevision: s.revision,
    result: { familySize: null, members: [], notes: [], ...result },
  };
  return mode === "reconcile"
    ? applySurveyReconciliation(s, envelope)
    : applySurveyExtraction(s, envelope);
}
function named() {
  const text = "Ravi is 31 years old.";
  return send(fresh(), text, {
    familySize: 1,
    familySizeEvidence: text,
    members: [
      {
        slot: 1,
        name: "Ravi",
        age: 31,
        evidence: text,
        attribution: proof(0, "Ravi", text),
      },
    ],
  });
}
describe("v3 templates and safe migration", () => {
  it("has one household contact, optional pregnancy timing, and concern-only weight", () => {
    const s = fresh();
    expect(surveySchema.safeParse(s).success).toBe(true);
    expect(s.templateVersion).toBe(3);
    expect(
      s.fields
        .filter((f) => f.id.toLowerCase().includes("phone"))
        .map((f) => [f.id, f.scope]),
    ).toEqual([["householdPhone", "household"]]);
    expect(s.fields.find((f) => f.id === "weight")?.section).toBe("health");
    expect(
      isSurveyFieldVisible(
        s.fields.find((f) => f.id === "weight")!,
        { values: {}, meta: {} },
      ),
    ).toBe(false);
    expect(s.fields.find((f) => f.id === "pregnancyWeeks")?.required).toBe(
      false,
    );
    expect(fresh("rainy").fields.some((f) => f.id === "stagnantWater")).toBe(
      true,
    );
  });
  it("shows gestation and postnatal details by stage without hiding historical answers", () => {
    const s = fresh("pregnancy"),
      field = (id: string) => s.fields.find((f) => f.id === id)!;
    const pregnant = { values: { maternalStage: "pregnant" }, meta: {} };
    const postnatal = { values: { maternalStage: "postnatal" }, meta: {} };
    expect(isSurveyFieldVisible(field("pregnancyMonths"), pregnant)).toBe(true);
    expect(isSurveyFieldVisible(field("deliveryDate"), pregnant)).toBe(false);
    expect(isSurveyFieldVisible(field("deliveryDate"), postnatal)).toBe(true);
    expect(isSurveyFieldVisible(field("pregnancyMonths"), postnatal)).toBe(
      false,
    );
    expect(
      isSurveyFieldVisible(field("pregnancyMonths"), {
        values: { ...postnatal.values, pregnancyMonths: 8 },
        meta: {},
      }),
    ).toBe(true);
  });
  it("migrates v2 drafts without erasing member contacts or duplicating existing notes", () => {
    let old = createSurvey(
      { householdId: "home", templateVersion: 2 },
      NOW,
      "old",
    );
    old = editSurveyField(old, null, "familySize", 2);
    old = editSurveyField(old, old.members[0].id, "phone", "9876543210");
    old = editSurveyField(old, old.members[1].id, "phone", "9876543210");
    old = editSurveyField(old, old.members[0].id, "weight", 54);
    const migrated = migrateDraftSurvey(old, NOW);
    expect(migrated.templateVersion).toBe(3);
    expect(migrated.household.values.householdPhone).toBe("9876543210");
    expect(migrated.members[0].values.phone).toBe("9876543210");
    expect(migrated.fields.find((f) => f.id === "phone")?.legacy).toBe(true);
    expect(migrated.members[0].values.weight).toBe(54);
    expect(migrated.revision).toBe(old.revision + 1);
    expect(migrateDraftSurvey(migrated)).toBe(migrated);
    expect(surveySchema.safeParse(migrated).success).toBe(true);
  });
  it("migrates the largest valid v2 field set within the archival snapshot cap", () => {
    const old = createSurvey({ householdId: "home", templateVersion: 2 });
    while (old.fields.length < 100)
      old.fields.push({
        id: `old-custom-${old.fields.length}`,
        label: `Custom ${old.fields.length}`,
        scope: "member",
        section: "health",
        type: "text",
        required: false,
        custom: true,
      });
    expect(surveySchema.safeParse(old).success).toBe(true);
    const migrated = migrateDraftSurvey(old);
    expect(migrated.fields.length).toBeGreaterThan(100);
    expect(surveySchema.safeParse(migrated).success).toBe(true);
    expect(migrated.fields.filter((field) => field.custom)).toHaveLength(
      old.fields.filter((field) => field.custom).length,
    );
  });
  it("retains different old contact numbers for review instead of choosing one", () => {
    let old = createSurvey({ householdId: "home", templateVersion: 2 });
    old = editSurveyField(old, null, "familySize", 2);
    old = editSurveyField(old, old.members[0].id, "phone", "9876543210");
    old = editSurveyField(old, old.members[1].id, "phone", "9876543211");
    const migrated = migrateDraftSurvey(old);
    expect(migrated.household.values.householdPhone).toBeUndefined();
    expect(migrated.uncertainties.at(-1)?.id).toContain("phone-migration");
  });
  it("keeps completed historical records byte-identical", () => {
    let old = createSurvey({ householdId: "home", templateVersion: 2 });
    old = editSurveyField(old, null, "familySize", 1);
    old = editSurveyField(old, old.members[0].id, "name", "Ravi");
    old = editSurveyField(old, old.members[0].id, "age", 31);
    old = completeSurvey(old);
    const serialized = JSON.stringify(old);
    expect(migrateDraftSurvey(old)).toBe(old);
    expect(JSON.stringify(migrateDraftSurvey(old))).toBe(serialized);
  });
  it("copies identities into new rainy IDs, including contact-only drafts without repeat links", () => {
    let prior = named();
    prior = editSurveyField(prior, null, "householdPhone", "9876543210");
    prior = editSurveyField(
      prior,
      prior.members[0].id,
      "healthHistory",
      "old fever",
    );
    const rainy = createRainySurveyFromPrior(
      { householdId: "home", priorSurvey: prior },
      NOW,
      "rainy-new",
    );
    expect(rainy.repeatOf).toBeUndefined();
    expect(rainy.members[0].id).not.toBe(prior.members[0].id);
    expect(rainy.members[0].values).toEqual({ name: "Ravi", age: 31 });
    expect(rainy.household.values.householdPhone).toBe("9876543210");
    const contact = editSurveyField(
      fresh(),
      null,
      "householdPhone",
      "9876543210",
    );
    const result = createRainySurveyFromPrior({
      householdId: "home",
      priorSurvey: contact,
    });
    expect(result.members).toEqual([]);
    expect(result.household.values.householdPhone).toBe("9876543210");
  });
});
describe("v3 person proof and measured facts", () => {
  it("applies fresh named introductions with all health and pregnancy facts without invented weeks", () => {
    const text =
      "Nandini is 24. She is two months pregnant and has received one injection.";
    const s = send(fresh("pregnancy"), text, {
      familySize: 1,
      familySizeEvidence: text,
      members: [
        {
          slot: 1,
          name: "Nandini",
          age: 24,
          pregnancyStatus: "yes",
          pregnancyMonths: 2,
          pregnancyInjectionCount: 1,
          healthHistory: text,
          evidence: text,
          attribution: proof(0, "Nandini", text),
        },
      ],
    });
    expect(s.members[0].values).toMatchObject({
      name: "Nandini",
      age: 24,
      pregnancyStatus: "yes",
      pregnancyMonths: 2,
      pregnancyInjectionCount: 1,
      healthHistory: text,
    });
    expect(s.members[0].values.pregnancyWeeks).toBeUndefined();
    expect(s.uncertainties).toEqual([]);
    expect(reviewSurvey(s).some((i) => i.fieldId === "pregnancyWeeks")).toBe(
      false,
    );
  });
  it("applies live-probe worker-labelled counselling while keeping a patient appointment unticked", () => {
    let s = editSurveyField(fresh("pregnancy"), null, "familySize", 1);
    s = editSurveyField(s, s.members[0].id, "name", "Anjali");
    const intro = "Anjali is five months pregnant.",
      card = "ASHA: Do you have your MCP card?",
      advice =
        "ASHA: Include a variety of foods and take your prescribed supplements.",
      appointment =
        "Anjali: My next antenatal appointment is on 20 December at the village PHC.";
    const text = [intro, card, advice, appointment].join(" ");
    s = send(s, text, {
      members: [
        {
          memberId: s.members[0].id,
          pregnancyMonths: 5,
          careMcpDiscussed: "done",
          careNutritionDiscussed: "done",
          careAncDiscussed: "done",
          nextCareVisit: "20 December",
          evidence: intro,
          fieldEvidence: {
            careMcpDiscussed: card,
            careNutritionDiscussed: advice,
            careAncDiscussed: appointment,
            nextCareVisit: appointment,
          },
          attribution: proof(0, "Anjali", intro),
        },
      ],
    });
    expect(s.members[0].values).toMatchObject({
      pregnancyMonths: 5,
      careMcpDiscussed: "done",
      careNutritionDiscussed: "done",
      nextCareVisit: "20 December",
    });
    expect(s.members[0].values.careAncDiscussed).toBeUndefined();
    expect(s.uncertainties).toHaveLength(1);
  });
  it("accepts colloquial Kannada husband for unique spouse and retains unitless103 without inventing conversion", () => {
    let s = editSurveyField(fresh(), null, "familySize", 2);
    s = editSurveyField(s, s.members[0].id, "relation", "self");
    s = editSurveyField(s, s.members[1].id, "relation", "spouse");
    const text =
      "ನಮ್ಮ ಮನೆಯಲ್ಲಿ ನಮ್ಮ ಯಜಮಾನರಿಗೆ ಒಂದು ವಾರದಿಂದ ಜ್ವರ ಇತ್ತು. ಅವರ temperature 103.";
    s = send(s, text, {
      members: [
        {
          memberId: s.members[1].id,
          feverDays: 7,
          temperature: 39.4,
          healthStatus: "concerns",
          healthHistory: text,
          evidence: text,
          attribution: proof(0, "husband", text, "relationship"),
        },
      ],
    });
    expect(normalizeRelationship("ಯಜಮಾನರಿಗೆ")).toBe("husband");
    expect(s.members[1].values.feverDays).toBe(7);
    expect(s.members[1].values.healthHistory).toContain("103");
    expect(s.members[1].values.temperature).toBeUndefined();
    expect(s.members[0].values.feverDays).toBeUndefined();
    expect(
      s.uncertainties.some((u) => u.message.includes("temperature unit")),
    ).toBe(true);
  });
  it("rejects a genuinely ambiguous husband/spouse assignment", () => {
    let s = editSurveyField(fresh(), null, "familySize", 2);
    s = editSurveyField(s, s.members[0].id, "relation", "husband");
    s = editSurveyField(s, s.members[1].id, "relation", "spouse");
    const text = "My husband has a fever.";
    s = send(s, text, {
      members: [
        {
          memberId: s.members[0].id,
          healthHistory: text,
          evidence: text,
          attribution: proof(0, "husband", text, "relationship"),
        },
      ],
    });
    expect(s.members.every((m) => m.values.healthHistory == null)).toBe(true);
    expect(s.uncertainties.length).toBe(1);
  });
  it("does not let a stale name proof bypass a current pronoun referent", () => {
    let s = editSurveyField(fresh(), null, "familySize", 2);
    s = editSurveyField(s, s.members[0].id, "name", "Ravi");
    s = editSurveyField(s, s.members[1].id, "name", "Sita");
    s = send(s, "Ravi is 31.", {});
    const text = "Sita is at home. She has a fever.";
    s = send(s, text, {
      members: [
        {
          memberId: s.members[0].id,
          healthHistory: "She has a fever.",
          evidence: text,
          fieldEvidence: { healthHistory: "She has a fever." },
          attribution: proof(0, "Ravi", "Ravi is 31.", "name"),
        },
      ],
    });
    expect(s.members[0].values.healthHistory).toBeUndefined();
    expect(
      s.uncertainties.some((item) => item.message.includes("nearest person")),
    ).toBe(true);
  });
  it("allows a contiguous pronoun follow-up anchored to the original person", () => {
    let s = named();
    const text = "He has a cough.";
    s = send(s, text, {
      members: [
        {
          memberId: s.members[0].id,
          healthHistory: text,
          evidence: text,
          attribution: proof(0, "Ravi", "Ravi is 31 years old.", "context"),
        },
      ],
    });
    expect(s.members[0].values.healthHistory).toBe(text);
    expect(s.uncertainties).toEqual([]);
  });
});
describe("v3 notes and additive reconciliation", () => {
  it("combines same-segment household field and multiple notes once", () => {
    const text =
      "The family moved recently. They prefer morning visits. The house is near the school.";
    const result = {
      householdFields: [
        {
          fieldId: "householdNotes",
          value: "The family moved recently.",
          evidence: "The family moved recently.",
        },
      ],
      notes: [
        {
          text: "They prefer morning visits.",
          evidence: "They prefer morning visits.",
        },
        {
          text: "The house is near the school.",
          evidence: "The house is near the school.",
        },
      ],
    };
    let s = send(fresh(), text, result, "reconcile");
    expect(String(s.household.values.householdNotes)).toContain("family moved");
    expect(String(s.household.values.householdNotes)).toContain(
      "morning visits",
    );
    expect(String(s.household.values.householdNotes)).toContain(
      "near the school",
    );
    const before = s;
    s = send(s, text, result, "reconcile", 0);
    expect(s).toBe(before);
  });
  it("recovers already-retained internal notes into a previously blank visible field", () => {
    const text = "The family prefers morning visits.",
      result = { notes: [{ text, evidence: text }] };
    let s = send(fresh(), text, result);
    s = { ...s, household: { values: {}, meta: {} } };
    s = send(s, text, result, "reconcile", 0);
    expect(s.household.values.householdNotes).toBe(text);
    expect(s.notes.length).toBe(1);
  });
  it("appends an omitted same-source health quote without overwriting or duplicating the first", () => {
    let s = named();
    const text = "Ravi has a cough. Ravi also reports a headache.";
    s = send(s, text, {
      members: [
        {
          memberId: s.members[0].id,
          healthHistory: "Ravi has a cough.",
          evidence: text,
          fieldEvidence: { healthHistory: "Ravi has a cough." },
          attribution: proof(1, "Ravi", text),
        },
      ],
    });
    const result = {
      members: [
        {
          memberId: s.members[0].id,
          healthHistory: "Ravi also reports a headache.",
          evidence: text,
          fieldEvidence: { healthHistory: "Ravi also reports a headache." },
          attribution: proof(1, "Ravi", text),
        },
      ],
    };
    s = send(s, text, result, "reconcile", 1);
    expect(s.members[0].values.healthHistory).toBe(
      "Ravi has a cough.\nRavi also reports a headache.",
    );
    const before = s;
    expect(send(s, text, result, "reconcile", 1)).toBe(before);
    const manual = editSurveyField(
      s,
      s.members[0].id,
      "healthHistory",
      "Worker correction",
    );
    expect(
      send(manual, text, result, "reconcile", 1).members[0].values
        .healthHistory,
    ).toBe("Worker correction");
  });
  it("cannot restore retracted fever inside a corrected no-fever history", () => {
    let s = named();
    const id = s.members[0].id;
    s = {
      ...s,
      members: s.members.map((m) => ({
        ...m,
        values: { ...m.values, healthHistory: "no fever" },
        meta: {
          ...m.meta,
          healthHistory: {
            source: "extracted" as const,
            revision: s.revision,
            segmentIndex: 1,
            manuallyProtected: false,
          },
        },
      })),
      audit: [
        ...s.audit,
        {
          id: "correction",
          timestamp: NOW,
          memberId: id,
          fieldId: "healthHistory",
          previousValue: "fever",
          value: "no fever",
          source: "extracted",
        },
      ],
    };
    expect(canAppendSurveyNarrative(s, id, "healthHistory", 1)).toBe(false);
  });
  it("does not append to unknown provenance or a newer revision than the request", () => {
    let s = named();
    const id = s.members[0].id;
    s = {
      ...s,
      members: s.members.map((m) => ({
        ...m,
        values: { ...m.values, healthHistory: "cough" },
      })),
    };
    expect(canAppendSurveyNarrative(s, id, "healthHistory", 1)).toBe(false);
    s = {
      ...s,
      members: s.members.map((m) => ({
        ...m,
        meta: {
          ...m.meta,
          healthHistory: {
            source: "extracted" as const,
            revision: s.revision + 1,
            segmentIndex: 1,
            manuallyProtected: false,
          },
        },
      })),
    };
    expect(
      canAppendSurveyNarrative(s, id, "healthHistory", 1, s.revision),
    ).toBe(false);
  });
});
describe("source-backed care topic checklists", () => {
  it.each([
    ["careMcpDiscussed", "ASHA: Do you have your MCP card?", true],
    [
      "careNutritionDiscussed",
      "ASHA: Include a variety of foods and take your prescribed supplements.",
      true,
    ],
    ["careMcpDiscussed", "ASHA: Have you discussed the MCP card?", false],
    [
      "careAncDiscussed",
      "Anjali: My next antenatal appointment is on 20 December at the village PHC.",
      false,
    ],
    ["careMcpDiscussed", "Have you discussed the MCP card?", false],
    ["careMcpDiscussed", "The worker never discussed the MCP card.", false],
    [
      "careInjectionsDiscussed",
      "She had one injection. I explained nutrition.",
      false,
    ],
    ["careMcpDiscussed", "She has a mother card.", false],
    ["careMcpDiscussed", "Has a mother card", false],
    ["careNutritionDiscussed", "We will discuss nutrition tomorrow.", false],
    ["careMcpDiscussed", "Please bring your mother card next visit.", true],
    ["careNutritionDiscussed", "You should eat nutritious food.", true],
    ["rainyWaterDiscussed", "Do not let water collect.", true],
    [
      "rainyWaterDiscussed",
      "Empty and scrub plant saucers weekly; cover containers.",
      true,
    ],
    ["rainyWaterDiscussed", "ನೀರು ನಿಲ್ಲದಂತೆ ನೋಡಿಕೊಳ್ಳಬೇಕು", true],
    ["rainyFeverDiscussed", "Does anyone have fever or cold?", true],
    ["rainyFeverDiscussed", "Does anyone have fever or cold", true],
    ["careMcpDiscussed", "I have discussed the MCP card.", true],
  ])("classifies %s from actual evidence: %s", (id, quote, expected) => {
    expect(hasCompletedCounsellingEvidence(quote, id)).toBe(expected);
  });
});
