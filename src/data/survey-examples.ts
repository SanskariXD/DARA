import {
  completeSurvey,
  createSurvey,
  editSurveyField,
  type Survey,
  type SurveyValue,
} from "../lib/survey";
import type { SurveyHousehold } from "../lib/survey-db";
import versionOneExamples from "./survey-examples-v1.json";

export const EXAMPLE_SEED_VERSION = 2;
const CREATED_AT = "2026-11-13T08:00:00.000Z";
const PREFIX = "dara-example-";

/** Fictional examples for exploring the register. No real person's record is represented. */
interface ExampleDefinition {
  key: string;
  label: string;
  code: string;
  address: string;
  kind: "pregnancy" | "family" | "rainy";
  members: Record<string, SurveyValue>[];
  householdValues?: Record<string, SurveyValue>;
}
const definitions: ExampleDefinition[] = [
  {
    key: "nandini",
    label: "Nandini & Kiran",
    code: "EX-001",
    address: "12, Temple Road",
    kind: "pregnancy",
    members: [
      {
        name: "Nandini Rao",
        age: 27,
        sex: "female",
        relation: "self",
        pregnancyStatus: "yes",
        maternalStage: "pregnant",
        pregnancyMonths: 2,
        pregnancyInjectionCount: 1,
        pregnancyInjections:
          "Reports one injection named Td first dose; the clinic record has not been verified. Fictional example.",
        mcpCardStatus: "has-card",
        pregnancyNutrition:
          "Reports three meals daily, including ragi, rice, vegetables and fruit when available.",
        pregnancySupplements:
          "Reports folic acid supplied by the clinic. Product strength and dose were not recorded.",
        careFacility: "Channasandra PHC — fictional example",
        lastAncVisit: "6 November 2026, reported by the family",
        nextCareVisit: "20 November 2026, planned clinic visit",
        careMcpDiscussed: "done",
        careInjectionsDiscussed: "done",
        careNutritionDiscussed: "done",
        careAncDiscussed: "done",
        careBirthPlanDiscussed: "pending",
        carePostnatalDiscussed: "pending",
        healthStatus: "no-concerns",
        healthHistory:
          "No concerns reported during this fictional antenatal follow-up.",
      },
      {
        name: "Kiran Rao",
        age: 31,
        sex: "male",
        relation: "spouse",
        healthStatus: "not-discussed",
      },
    ],
  },
  {
    key: "ayesha",
    label: "Ayesha & Imran",
    code: "EX-002",
    address: "7, School Lane",
    kind: "pregnancy",
    members: [
      {
        name: "Ayesha Begum",
        age: 25,
        sex: "female",
        relation: "self",
        pregnancyStatus: "yes",
        maternalStage: "pregnant",
        pregnancyWeeks: 16,
        pregnancyInjectionCount: 2,
        pregnancyInjections:
          "Reports two Td injections recorded at the clinic. Fictional report, not a vaccination recommendation.",
        mcpCardStatus: "needs-card",
        pregnancyNutrition:
          "Reports two main meals and small snacks; says nausea sometimes affects breakfast.",
        pregnancySupplements:
          "Reports iron-folic acid and calcium provided by the clinic; dose and adherence were not confirmed.",
        careFacility: "Garden Road maternity clinic — fictional example",
        lastAncVisit: "10 November 2026, reported by the family",
        nextCareVisit: "27 November 2026, planned antenatal visit",
        careMcpDiscussed: "pending",
        careInjectionsDiscussed: "done",
        careNutritionDiscussed: "done",
        careAncDiscussed: "done",
        careBirthPlanDiscussed: "pending",
        carePostnatalDiscussed: "pending",
        healthStatus: "concerns",
        healthHistory:
          "Reports occasional nausea. This is a fictional example; no diagnosis or referral is implied.",
      },
      {
        name: "Imran Ahmed",
        age: 29,
        sex: "male",
        relation: "spouse",
        healthStatus: "not-discussed",
      },
      {
        name: "Sara Ahmed",
        age: 3,
        sex: "female",
        relation: "child",
        healthStatus: "not-discussed",
      },
    ],
  },
  {
    key: "savitri",
    label: "Savitri & Manjunath",
    code: "EX-003",
    address: "21, Lake Road",
    kind: "family",
    members: [
      {
        name: "Savitri Hegde",
        age: 54,
        sex: "female",
        relation: "self",
        healthStatus: "concerns",
        healthHistory:
          "Reports a history of high blood pressure and regular follow-up visits.",
        hypertension: "yes",
        weight: 62,
      },
      {
        name: "Manjunath Hegde",
        age: 59,
        sex: "male",
        relation: "spouse",
        healthStatus: "no-concerns",
        weight: 71,
      },
    ],
  },
  {
    key: "meena",
    label: "Meena & Prakash",
    code: "EX-004",
    address: "9, Garden Cross",
    kind: "rainy",
    householdValues: {
      stagnantWater: "yes",
      waterLocations:
        "Family reports water collecting near the backyard drain and in an uncovered bucket after recent rain.",
      rainyFeverDiscussed: "done",
      rainyWaterDiscussed: "done",
      rainyMosquitoDiscussed: "done",
      rainyReferralDiscussed: "pending",
      householdNotes:
        "Fictional rainy-season survey. Recent rain and a damp veranda were reported. To do: family plans to empty the bucket and check the drain; worker to review these tasks and the pending seeking-care discussion at the next visit.",
    },
    members: [
      {
        name: "Meena Kumar",
        age: 34,
        sex: "female",
        relation: "self",
        healthStatus: "no-concerns",
        weight: 58,
      },
      {
        name: "Prakash Kumar",
        age: 38,
        sex: "male",
        relation: "spouse",
        healthStatus: "no-concerns",
        weight: 73,
      },
      {
        name: "Aditya Kumar",
        age: 8,
        sex: "male",
        relation: "child",
        healthStatus: "concerns",
        healthHistory:
          "Family reports a runny nose for two days. No diagnosis is recorded in this fictional example.",
        weight: 25,
      },
      {
        name: "Kavya Kumar",
        age: 4,
        sex: "female",
        relation: "child",
        healthStatus: "no-concerns",
        weight: 16,
      },
    ],
  },
  {
    key: "mary",
    label: "Mary & Joseph",
    code: "EX-005",
    address: "16, Mill Road",
    kind: "family",
    members: [
      {
        name: "Mary Joseph",
        age: 43,
        sex: "female",
        relation: "self",
        healthStatus: "no-concerns",
        weight: 60,
      },
      {
        name: "Joseph Mathew",
        age: 47,
        sex: "male",
        relation: "spouse",
        healthStatus: "not-discussed",
      },
      {
        name: "Anna Joseph",
        age: 16,
        sex: "female",
        relation: "child",
        healthStatus: "no-concerns",
        weight: 48,
      },
    ],
  },
];

export const EXAMPLE_HOUSEHOLD_IDS = definitions.map(
  (entry) => `${PREFIX}home-${entry.key}`,
);
export const EXAMPLE_SURVEY_IDS = definitions.map(
  (entry) => `${PREFIX}survey-${entry.key}`,
);
export function isExampleSurvey(surveyId: string): boolean {
  return EXAMPLE_SURVEY_IDS.includes(surveyId);
}
export function isExampleHousehold(householdId: string): boolean {
  return EXAMPLE_HOUSEHOLD_IDS.includes(householdId);
}

/** A fresh copy each time makes explicit reset deterministic and independent of prior edits. */
export function getExampleWorkspace(
  seedVersion: 1 | 2 = EXAMPLE_SEED_VERSION,
): {
  households: SurveyHousehold[];
  surveys: Survey[];
} {
  // Frozen output of the released v0.3 generator: equality checks must never
  // recompute old samples through a changed template or extraction engine.
  if (seedVersion === 1)
    return structuredClone(versionOneExamples) as {
      households: SurveyHousehold[];
      surveys: Survey[];
    };
  const households: SurveyHousehold[] = [];
  const surveys: Survey[] = [];
  for (const entry of definitions) {
    const householdId = `${PREFIX}home-${entry.key}`;
    households.push({
      id: householdId,
      label: entry.label,
      code: entry.code,
      address: entry.address,
      area: "Channasandra",
      createdAt: CREATED_AT,
      source: "example",
    });
    let survey = createSurvey(
      {
        householdId,
        templateId:
          entry.kind === "pregnancy"
            ? "pregnancy-follow-up"
            : entry.kind === "rainy"
              ? "rainy-season"
              : "family-health",
      },
      CREATED_AT,
      `${PREFIX}survey-${entry.key}`,
    );
    survey = editSurveyField(
      survey,
      null,
      "familySize",
      entry.members.length,
      CREATED_AT,
    );
    for (const [index, values] of entry.members.entries()) {
      const memberId = survey.members[index].id;
      for (const [fieldId, value] of Object.entries(values)) {
        if (
          !survey.fields.some(
            (field) => field.id === fieldId && field.scope === "member",
          )
        )
          throw new Error(
            `Example field ${fieldId} is missing from ${survey.templateId}.`,
          );
        survey = editSurveyField(
          survey,
          memberId,
          fieldId,
          value as SurveyValue,
          CREATED_AT,
        );
      }
    }
    survey = editSurveyField(
      survey,
      null,
      "householdNotes",
      "Fictional example record. Use a new household for your own entries.",
      CREATED_AT,
    );
    for (const [fieldId, value] of Object.entries(
      entry.householdValues ?? {},
    )) {
      if (
        !survey.fields.some(
          (field) => field.id === fieldId && field.scope === "household",
        )
      )
        throw new Error(
          `Example household field ${fieldId} is missing from ${survey.templateId}.`,
        );
      survey = editSurveyField(survey, null, fieldId, value, CREATED_AT);
    }
    // Keep antenatal and rainy-season examples editable; general examples illustrate immutable history and repeat surveys.
    if (entry.kind === "family") survey = completeSurvey(survey, CREATED_AT);
    surveys.push(survey);
  }
  return { households, surveys };
}
