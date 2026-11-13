import { describe, expect, it } from "vitest";
import {
  decodeProviderWire,
  retainMissingProposals,
} from "../src/lib/server/live-providers";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  createSurvey,
  editSurveyField,
  type Survey,
  type SurveyTranscript,
} from "../src/lib/survey";
const timestamp = "2026-11-13T16:00:00.000Z";
const passage = (
  text: string,
  language: SurveyTranscript["language"] = "en",
): SurveyTranscript => ({
  id: "care-source",
  index: 0,
  text,
  language,
  timestamp,
  source: "manual",
});
const empty = () => ({
  familySize: null,
  familySizeEvidence: null,
  familySizeCorrection: null,
  members: [],
  householdFields: [],
  notes: [],
  uncertainties: [],
});
const field = (fieldId: string, value: string, evidence: string) => ({
  fieldId,
  value,
  evidence,
});
function apply(survey: Survey, segment: SurveyTranscript, input: unknown) {
  const draft = addSurveyTranscript(survey, segment);
  const result = decodeProviderWire(input, draft, segment);
  return applySurveyExtraction(draft, {
    surveyId: draft.id,
    segmentId: segment.id,
    segmentIndex: segment.index,
    baseRevision: draft.revision,
    result,
  });
}
function named(
  templateId:
    "family-health" | "pregnancy-follow-up" | "rainy-season" = "family-health",
  name = "Anjali",
  relation = "self",
) {
  let survey = editSurveyField(
    createSurvey({ householdId: "synthetic-care", templateId }),
    null,
    "familySize",
    1,
  );
  survey = editSurveyField(survey, survey.members[0].id, "name", name);
  return editSurveyField(survey, survey.members[0].id, "relation", relation);
}

describe("v3 provider proposals applied to the current engine", () => {
  it("does not recover retracted fever from a previous quote even when the compact server snapshot omits the audit", () => {
    const source = passage("Anjali has fever.");
    let survey = addSurveyTranscript(named(), source);
    const id = survey.members[0].id;
    survey.members[0].values.healthHistory = "no fever";
    survey.members[0].meta.healthHistory = {
      source: "extracted",
      revision: survey.revision,
      segmentIndex: 1,
      manuallyProtected: false,
    };
    survey.audit.push({
      id: "explicit-correction",
      timestamp,
      memberId: id,
      fieldId: "healthHistory",
      previousValue: "fever",
      value: "no fever",
      source: "extracted",
      evidence: "No fever now.",
    });
    const result = decodeProviderWire(
      {
        ...empty(),
        members: [
          {
            memberId: id,
            slot: 1,
            fields: [field("healthHistory", "fever", source.text)],
            evidence: source.text,
            uncertain: false,
            attribution: {
              kind: "name",
              reference: "Anjali",
              evidence: source.text,
              segmentId: source.id,
            },
            corrections: [],
          },
        ],
      },
      survey,
      source,
    );
    expect(retainMissingProposals(result, survey, source).members).toHaveLength(
      0,
    );
    const proposed = retainMissingProposals(
      result,
      { ...survey, audit: [] },
      source,
    );
    const next = applySurveyReconciliation(survey, {
      surveyId: survey.id,
      segmentId: source.id,
      segmentIndex: source.index,
      baseRevision: survey.revision,
      mode: "reconcile",
      result: proposed,
    });
    expect(next.members[0].values.healthHistory).toBe("no fever");
  });
  it("fills health and household notes after a fresh named introduction in the same response", () => {
    const intro = "My name is Anjali.";
    const health = "I have fever for three days.";
    const note = "Our drinking water supply is irregular.";
    const segment = passage(
      `There is one person in this household. ${intro} I am 28 years old. ${health} ${note}`,
    );
    const result = apply(
      createSurvey({ householdId: "synthetic-care" }),
      segment,
      {
        ...empty(),
        familySize: 1,
        familySizeEvidence: "There is one person in this household.",
        members: [
          {
            memberId: null,
            slot: 1,
            fields: [
              field("name", "Anjali", intro),
              field("age", "28", "I am 28 years old."),
              field("healthStatus", "concerns", health),
              field("healthHistory", health, health),
              field("feverDays", "3", health),
            ],
            evidence: segment.text,
            uncertain: false,
            attribution: {
              kind: "name",
              reference: "Anjali",
              evidence: intro,
              segmentId: segment.id,
            },
            corrections: [],
          },
        ],
        householdFields: [field("householdNotes", note, note)],
      },
    );
    expect(result.members[0].values).toMatchObject({
      name: "Anjali",
      age: 28,
      healthStatus: "concerns",
      healthHistory: health,
      feverDays: 3,
    });
    expect(result.household.values.householdNotes).toBe(note);
    expect(result.uncertainties).toHaveLength(0);
  });
  it("maps Kannada household husband and his pronoun without assuming a unit for 103", () => {
    const survey = named("family-health", "Ravi", "husband");
    const evidence = "ನಮ್ಮ ಮನೆಯಲ್ಲಿ ನಮ್ಮ ಯಜಮಾನರಿಗೆ ಒಂದು ವಾರದಿಂದ ಜ್ವರ ಇತ್ತು.";
    const measurement = "ಅವರ temperature 103.";
    const note = "ನಮ್ಮ ಮನೆಯ ಕುಡಿಯುವ ನೀರಿನ ಸರಬರಾಜು ಸರಿಯಾಗಿಲ್ಲ.";
    const segment = passage(`${evidence} ${measurement} ${note}`, "kn");
    const result = apply(survey, segment, {
      ...empty(),
      members: [
        {
          memberId: survey.members[0].id,
          slot: 1,
          fields: [
            field("healthStatus", "concerns", evidence),
            field(
              "healthHistory",
              `${evidence} ${measurement}`,
              `${evidence} ${measurement}`,
            ),
            field("feverDays", "7", evidence),
            field("temperature", "39.4", measurement),
          ],
          evidence: `${evidence} ${measurement}`,
          uncertain: false,
          attribution: {
            kind: "relationship",
            reference: "ಯಜಮಾನರಿಗೆ",
            evidence,
            segmentId: segment.id,
          },
          corrections: [],
        },
      ],
      householdFields: [field("householdNotes", note, note)],
    });
    expect(result.members[0].values).toMatchObject({
      healthStatus: "concerns",
      feverDays: 7,
    });
    expect(result.members[0].values.healthHistory).toContain("103");
    expect(result.members[0].values.temperature).toBeUndefined();
    expect(result.household.values.householdNotes).toBe(note);
    expect(
      result.uncertainties.some((item) =>
        item.message.includes("temperature unit"),
      ),
    ).toBe(true);
  });
  it("keeps unspecified injection facts separate from completed or future counselling", () => {
    const survey = named("pregnancy-follow-up");
    const intro = "Anjali is five months pregnant.";
    const injection =
      "She has received one injection but does not know its name.";
    const nutrition =
      "The ASHA explained nutrition and supplements to Anjali today.";
    const future = "The ASHA will discuss injections at the next visit.";
    const segment = passage(`${intro} ${injection} ${nutrition} ${future}`);
    const result = apply(survey, segment, {
      ...empty(),
      members: [
        {
          memberId: survey.members[0].id,
          slot: 1,
          fields: [
            field("pregnancyMonths", "5", intro),
            field("pregnancyInjections", "injection unspecified", injection),
            field("pregnancyInjectionCount", "1", injection),
            field("careNutritionDiscussed", "done", nutrition),
            field("careInjectionsDiscussed", "done", injection),
            field("careMcpDiscussed", "done", future),
          ],
          evidence: segment.text,
          uncertain: false,
          attribution: {
            kind: "name",
            reference: "Anjali",
            evidence: intro,
            segmentId: segment.id,
          },
          corrections: [],
        },
      ],
    });
    expect(result.members[0].values).toMatchObject({
      pregnancyMonths: 5,
      pregnancyInjectionCount: 1,
      pregnancyInjections: injection,
      careNutritionDiscussed: "done",
    });
    expect(result.members[0].values.careInjectionsDiscussed).not.toBe("done");
    expect(result.members[0].values.careMcpDiscussed).not.toBe("done");
    expect(result.members[0].values.pregnancyInjections).not.toContain("Td");
  });
  it("uses rainy household fields and only marks completed topic-specific advice", () => {
    const survey = named("rainy-season");
    const water = "There is stagnant water behind the tank.";
    const done = "The ASHA explained how to remove standing water.";
    const future = "The ASHA will discuss mosquito prevention tomorrow.";
    const segment = passage(`${water} ${done} ${future}`);
    const result = apply(survey, segment, {
      ...empty(),
      householdFields: [
        field("stagnantWater", "yes", water),
        field("waterLocations", "behind the tank", water),
        field("rainyWaterDiscussed", "done", done),
        field("rainyMosquitoDiscussed", "done", future),
      ],
    });
    expect(result.household.values).toMatchObject({
      stagnantWater: "yes",
      waterLocations: "behind the tank",
      rainyWaterDiscussed: "done",
    });
    expect(result.household.values.rainyMosquitoDiscussed).not.toBe("done");
  });
});
