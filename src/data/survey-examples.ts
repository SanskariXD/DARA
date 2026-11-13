import {
  completeSurvey,
  createSurvey,
  editSurveyField,
  type Survey,
  type SurveyValue,
} from "../lib/survey";
import type { SurveyHousehold } from "../lib/survey-db";

export const EXAMPLE_SEED_VERSION = 1;
const CREATED_AT = "2026-11-13T08:00:00.000Z";
const PREFIX = "dara-example-";

/** Fictional examples for exploring the register. No real person's record is represented. */
const definitions = [
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
        pregnancyWeeks: 24,
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
        pregnancyWeeks: 16,
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
    kind: "family",
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
        healthStatus: "no-concerns",
        weight: 25,
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
] as const;

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
export function getExampleWorkspace(): {
  households: SurveyHousehold[];
  surveys: Survey[];
} {
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
          entry.kind === "pregnancy" ? "pregnancy-follow-up" : "family-health",
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
          continue;
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
    // Keep antenatal examples editable; general examples illustrate immutable visit history and repeat surveys.
    if (entry.kind === "family") survey = completeSurvey(survey, CREATED_AT);
    surveys.push(survey);
  }
  return { households, surveys };
}
