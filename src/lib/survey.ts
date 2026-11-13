import { z } from "zod";
import {
  RELATIONSHIP_OPTIONS,
  normalizeRelationship,
  relationshipSex,
  normalizeIdentityText,
  containsIdentityReference,
  mentionedRelationships,
  evidenceSupportsRelationship,
} from "./survey-relations";
export {
  RELATIONSHIP_OPTIONS,
  normalizeRelationship,
  relationshipSex,
} from "./survey-relations";

export type SurveyValue = string | number | boolean | null;
export type SurveyFieldType = "text" | "number" | "select" | "textarea";
export interface SurveyFieldDefinition {
  id: string;
  label: string;
  scope: "household" | "member";
  type: SurveyFieldType;
  section: "household" | "family" | "health" | "notes";
  required: boolean;
  unit?: string;
  options?: { value: string; label: string }[];
  custom?: boolean;
  legacy?: boolean;
  visibleWhen?: { fieldId: string; equals: SurveyValue };
}
export interface SurveyFieldMeta {
  source: "manual" | "extracted" | "derived" | "migration";
  revision: number;
  segmentIndex: number;
  derivedFrom?: "relation";
  manuallyProtected: boolean;
  evidence?: string;
  segmentId?: string;
}
export interface SurveyAnswerRecord {
  values: Record<string, SurveyValue>;
  meta: Record<string, SurveyFieldMeta>;
}
export interface SurveyMember extends SurveyAnswerRecord {
  id: string;
}
export interface SurveyTranscript {
  id: string;
  index: number;
  text: string;
  timestamp: string;
  language: "en" | "kn" | "hi" | "te" | "ta" | "ml" | "auto";
  source: "gnani" | "manual";
  detectedLanguageCode?: string | null;
}
export interface SurveyNote {
  id: string;
  text: string;
  evidence: string;
  memberId: string | null;
  source: "manual" | "extracted";
  segmentId?: string;
  reviewed: boolean;
}
export interface SurveyConflict {
  id: string;
  memberId: string | null;
  fieldId: string;
  currentValue: SurveyValue;
  proposedValue: SurveyValue;
  evidence: string;
  reason: string;
  resolved: boolean;
}
export interface SurveyUncertainty {
  id: string;
  message: string;
  evidence: string;
  memberId: string | null;
  resolved: boolean;
  segmentId?: string;
}
export interface SurveyAuditEntry {
  id: string;
  timestamp: string;
  memberId: string | null;
  fieldId: string;
  previousValue: SurveyValue;
  value: SurveyValue;
  source: "manual" | "extracted" | "resolution" | "derived" | "migration";
  evidence?: string;
}
export interface Survey {
  id: string;
  householdId: string;
  templateId: string;
  templateVersion: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  status: "draft" | "completed";
  revision: number;
  repeatOf?: string;
  workspaceGeneration?: string;
  fields: SurveyFieldDefinition[];
  household: SurveyAnswerRecord;
  members: SurveyMember[];
  transcripts: SurveyTranscript[];
  processedSegmentIds: string[];
  notes: SurveyNote[];
  conflicts: SurveyConflict[];
  uncertainties: SurveyUncertainty[];
  audit: SurveyAuditEntry[];
}
export interface SurveyReviewIssue {
  id: string;
  memberId: string | null;
  fieldId?: string;
  kind: "missing" | "invalid" | "conflict" | "uncertain" | "count";
  message: string;
}

const valueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const evidenceSchema = z.string().min(1).max(8000);
export const extractedSurveyFieldSchema = z
  .object({
    fieldId: z.string().min(1).max(120),
    value: valueSchema,
    evidence: evidenceSchema,
  })
  .strict();
export const surveyAttributionSchema = z
  .object({
    kind: z.enum(["name", "relationship", "introduction", "context"]),
    reference: z.string().min(1).max(120),
    evidence: evidenceSchema,
    segmentId: z.string().min(1).max(160),
  })
  .strict();
export const surveyCorrectionSchema = z
  .object({
    fieldId: z.string().min(1).max(120),
    previousValue: valueSchema,
    evidence: evidenceSchema,
  })
  .strict();
export const extractedSurveyMemberSchema = z
  .object({
    memberId: z.string().max(160).nullable().optional(),
    slot: z.number().int().min(1).max(30).nullable().optional(),
    name: z.string().max(100).nullable().optional(),
    age: z.number().int().min(0).max(120).nullable().optional(),
    relation: z.string().max(120).nullable().optional(),
    sex: z
      .enum(["female", "male", "other", "not-stated"])
      .nullable()
      .optional(),
    phone: z.string().max(30).nullable().optional(),
    healthStatus: z
      .enum(["not-discussed", "no-concerns", "concerns"])
      .nullable()
      .optional(),
    healthHistory: z.string().max(4000).nullable().optional(),
    hypertension: z.enum(["yes", "no", "unknown"]).nullable().optional(),
    attribution: surveyAttributionSchema.optional(),
    corrections: z.array(surveyCorrectionSchema).max(30).optional(),
    fieldEvidence: z.record(z.string().max(120), evidenceSchema).optional(),
    symptoms: z.string().max(4000).nullable().optional(),
    conditions: z.string().max(4000).nullable().optional(),
    pregnancyStatus: z
      .enum(["yes", "no", "unknown", "not-applicable"])
      .nullable()
      .optional(),
    pregnancyWeeks: z.number().nullable().optional(),
    temperature: z.number().nullable().optional(),
    feverDays: z.number().nullable().optional(),
    breathingDifficulty: z.enum(["yes", "no", "unknown"]).nullable().optional(),
    systolic: z.number().nullable().optional(),
    diastolic: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    evidence: evidenceSchema,
    uncertain: z.boolean().optional(),
    customFields: z.array(extractedSurveyFieldSchema).max(30).optional(),
  })
  .strict();

/** Sparse field proposals; null means not stated and never clears an answer. */
export const surveyExtractionSchema = z
  .object({
    familySize: z.number().int().min(1).max(30).nullable(),
    familySizeEvidence: z.string().max(8000).nullable().optional(),
    familySizeCorrection: z
      .object({ previousValue: valueSchema, evidence: evidenceSchema })
      .strict()
      .optional(),
    members: z.array(extractedSurveyMemberSchema).max(30),
    householdFields: z.array(extractedSurveyFieldSchema).max(30).optional(),
    notes: z
      .array(
        z
          .object({
            text: z.string().min(1).max(4000),
            evidence: evidenceSchema,
            memberId: z.string().max(160).nullable().optional(),
            attribution: surveyAttributionSchema.optional(),
          })
          .strict(),
      )
      .max(30),
    uncertainties: z
      .array(
        z
          .object({
            text: z.string().min(1).max(4000),
            evidence: evidenceSchema,
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict();
export type SurveyExtractionResult = z.infer<typeof surveyExtractionSchema>;
export interface SurveyExtractionEnvelope {
  surveyId: string;
  segmentId: string;
  segmentIndex: number;
  baseRevision: number;
  result: SurveyExtractionResult;
  mode?: "live" | "reconcile";
}
export const surveyExtractionEnvelopeSchema = z
  .object({
    surveyId: z.string().min(1).max(160),
    segmentId: z.string().min(1).max(160),
    segmentIndex: z.number().int().nonnegative(),
    baseRevision: z.number().int().nonnegative(),
    result: surveyExtractionSchema,
    mode: z.enum(["live", "reconcile"]).optional(),
  })
  .strict();

export const surveyFieldSchema = z
  .object({
    id: z.string().min(1).max(120),
    label: z.string().trim().min(1).max(100),
    scope: z.enum(["household", "member"]),
    type: z.enum(["text", "number", "select", "textarea"]),
    section: z.enum(["household", "family", "health", "notes"]),
    required: z.boolean(),
    unit: z.string().max(30).optional(),
    options: z
      .array(
        z
          .object({
            value: z.string().min(1).max(100),
            label: z.string().min(1).max(100),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    custom: z.boolean().optional(),
    legacy: z.boolean().optional(),
    visibleWhen: z
      .object({ fieldId: z.string().min(1).max(120), equals: valueSchema })
      .strict()
      .optional(),
  })
  .strict();
const metaSchema = z
  .object({
    source: z.enum(["manual", "extracted", "derived", "migration"]),
    derivedFrom: z.literal("relation").optional(),
    revision: z.number().int().nonnegative(),
    segmentIndex: z.number().int().min(-1),
    manuallyProtected: z.boolean(),
    evidence: z.string().max(8000).optional(),
    segmentId: z.string().max(160).optional(),
  })
  .strict();
const recordShape = {
  values: z.record(z.string().max(120), valueSchema),
  meta: z.record(z.string().max(120), metaSchema),
};
export const surveyTranscriptSchema = z
  .object({
    id: z.string().min(1).max(160),
    index: z.number().int().nonnegative(),
    text: z.string().min(1).max(16000),
    timestamp: z.string().datetime(),
    language: z.enum(["en", "kn", "hi", "te", "ta", "ml", "auto"]),
    source: z.enum(["gnani", "manual"]),
    detectedLanguageCode: z.string().max(60).nullable().optional(),
  })
  .strict();
export const surveySchema = z
  .object({
    id: z.string().min(1).max(160),
    householdId: z.string().min(1).max(160),
    templateId: z.string().min(1).max(100),
    templateVersion: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    status: z.enum(["draft", "completed"]),
    revision: z.number().int().nonnegative(),
    repeatOf: z.string().max(160).optional(),
    workspaceGeneration: z.string().min(1).max(160).optional(),
    fields: z.array(surveyFieldSchema).max(100),
    household: z.object(recordShape).strict(),
    members: z
      .array(
        z.object({ id: z.string().min(1).max(160), ...recordShape }).strict(),
      )
      .max(30),
    transcripts: z.array(surveyTranscriptSchema).max(2000),
    processedSegmentIds: z.array(z.string().max(160)).max(2000),
    notes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(300),
            text: z.string().max(4000),
            evidence: z.string().max(8000),
            memberId: z.string().max(160).nullable(),
            source: z.enum(["manual", "extracted"]),
            segmentId: z.string().max(160).optional(),
            reviewed: z.boolean(),
          })
          .strict(),
      )
      .max(2000),
    conflicts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(500),
            memberId: z.string().max(160).nullable(),
            fieldId: z.string().max(120),
            currentValue: valueSchema,
            proposedValue: valueSchema,
            evidence: z.string().max(8000),
            reason: z.string().max(1000),
            resolved: z.boolean(),
          })
          .strict(),
      )
      .max(2000),
    uncertainties: z
      .array(
        z
          .object({
            id: z.string().min(1).max(500),
            message: z.string().max(4000),
            evidence: z.string().max(8000),
            memberId: z.string().max(160).nullable(),
            resolved: z.boolean(),
            segmentId: z.string().max(160).optional(),
          })
          .strict(),
      )
      .max(2000),
    audit: z
      .array(
        z
          .object({
            id: z.string().min(1).max(300),
            timestamp: z.string().datetime(),
            memberId: z.string().max(160).nullable(),
            fieldId: z.string().max(120),
            previousValue: valueSchema,
            value: valueSchema,
            source: z.enum([
              "manual",
              "extracted",
              "resolution",
              "derived",
              "migration",
            ]),
            evidence: z.string().max(8000).optional(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict()
  .superRefine((survey, ctx) => {
    if (
      new Set(survey.members.map((member) => member.id)).size !==
      survey.members.length
    )
      ctx.addIssue({ code: "custom", message: "Member IDs must be unique." });
    if (
      new Set(survey.fields.map((field) => field.id)).size !==
      survey.fields.length
    )
      ctx.addIssue({ code: "custom", message: "Field IDs must be unique." });
    if (
      new Set(survey.transcripts.map((segment) => segment.id)).size !==
      survey.transcripts.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Transcript IDs must be unique.",
      });
    if (
      new Set(survey.transcripts.map((segment) => segment.index)).size !==
      survey.transcripts.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Transcript indices must be unique.",
      });
    if (
      new Set(survey.processedSegmentIds).size !==
      survey.processedSegmentIds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Processed segment IDs must be unique.",
      });
    if ((survey.status === "completed") !== (survey.completedAt !== null))
      ctx.addIssue({
        code: "custom",
        message: "Completion status and timestamp disagree.",
      });
    for (const [id, scope] of [
      ["familySize", "household"],
      ["name", "member"],
      ["age", "member"],
    ] as const) {
      if (
        !survey.fields.some(
          (field) =>
            field.id === id &&
            field.scope === scope &&
            field.required &&
            !field.visibleWhen,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: `Required template field is missing: ${id}.`,
        });
    }
    for (const [memberId, record] of [
      [null, survey.household],
      ...survey.members.map((member) => [member.id, member] as const),
    ] as const) {
      for (const key of [
        ...Object.keys(record.values),
        ...Object.keys(record.meta),
      ]) {
        if (
          !survey.fields.some(
            (field) =>
              field.id === key &&
              field.scope === (memberId ? "member" : "household"),
          )
        )
          ctx.addIssue({
            code: "custom",
            message: `Unknown answer field: ${key}.`,
          });
      }
    }
  });

export const LEGACY_FAMILY_HEALTH_TEMPLATE: {
  id: string;
  version: number;
  fields: SurveyFieldDefinition[];
} = {
  id: "family-health",
  version: 1,
  fields: [
    {
      id: "familySize",
      label: "Family members",
      scope: "household",
      type: "number",
      section: "household",
      required: true,
    },
    {
      id: "householdNotes",
      label: "Household notes",
      scope: "household",
      type: "textarea",
      section: "notes",
      required: false,
    },
    {
      id: "name",
      label: "Full name",
      scope: "member",
      type: "text",
      section: "family",
      required: true,
    },
    {
      id: "age",
      label: "Age",
      scope: "member",
      type: "number",
      section: "family",
      required: true,
      unit: "years",
    },
    {
      id: "relation",
      label: "Relationship",
      scope: "member",
      type: "text",
      section: "family",
      required: false,
    },
    {
      id: "sex",
      label: "Sex",
      scope: "member",
      type: "select",
      section: "family",
      required: false,
      options: [
        { value: "female", label: "Female" },
        { value: "male", label: "Male" },
        { value: "other", label: "Other" },
        { value: "not-stated", label: "Not stated" },
      ],
    },
    {
      id: "phone",
      label: "Phone number",
      scope: "member",
      type: "text",
      section: "family",
      required: false,
    },
    {
      id: "symptoms",
      label: "Reported symptoms",
      scope: "member",
      type: "textarea",
      section: "health",
      required: false,
    },
    {
      id: "conditions",
      label: "Reported health conditions",
      scope: "member",
      type: "textarea",
      section: "health",
      required: false,
    },
    {
      id: "feverDays",
      label: "Fever duration",
      scope: "member",
      type: "number",
      section: "health",
      required: false,
      unit: "days",
    },
    {
      id: "temperature",
      label: "Temperature",
      scope: "member",
      type: "number",
      section: "health",
      required: false,
      unit: "°C",
    },
    {
      id: "breathingDifficulty",
      label: "Breathing difficulty reported",
      scope: "member",
      type: "select",
      section: "health",
      required: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unknown", label: "Not known" },
      ],
    },
    {
      id: "systolic",
      label: "Blood pressure · systolic",
      scope: "member",
      type: "number",
      section: "health",
      required: false,
      unit: "mmHg",
    },
    {
      id: "diastolic",
      label: "Blood pressure · diastolic",
      scope: "member",
      type: "number",
      section: "health",
      required: false,
      unit: "mmHg",
    },
    {
      id: "weight",
      label: "Weight",
      scope: "member",
      type: "number",
      section: "health",
      required: false,
      unit: "kg",
    },
    {
      id: "pregnancyStatus",
      label: "Pregnancy status",
      scope: "member",
      type: "select",
      section: "health",
      required: false,
      options: [
        { value: "yes", label: "Pregnant" },
        { value: "no", label: "Not pregnant" },
        { value: "unknown", label: "Not known" },
        { value: "not-applicable", label: "Not applicable" },
      ],
    },
    {
      id: "pregnancyWeeks",
      label: "Gestational age",
      scope: "member",
      type: "number",
      section: "health",
      required: true,
      unit: "weeks",
      visibleWhen: { fieldId: "pregnancyStatus", equals: "yes" },
    },
    {
      id: "notes",
      label: "Member notes",
      scope: "member",
      type: "textarea",
      section: "notes",
      required: false,
    },
  ],
};

export const FAMILY_HEALTH_TEMPLATE: {
  id: string;
  version: number;
  fields: SurveyFieldDefinition[];
} = {
  id: "family-health",
  version: 2,
  fields: [
    ...LEGACY_FAMILY_HEALTH_TEMPLATE.fields
      .filter((field) =>
        [
          "familySize",
          "householdNotes",
          "name",
          "age",
          "sex",
          "phone",
          "weight",
          "feverDays",
          "temperature",
          "breathingDifficulty",
          "pregnancyStatus",
          "pregnancyWeeks",
        ].includes(field.id),
      )
      .map((field) => ({
        ...field,
        ...(field.id === "weight" ? { section: "family" as const } : {}),
      })),
    {
      id: "relation",
      label: "Relationship",
      scope: "member",
      type: "select",
      section: "family",
      required: false,
      options: RELATIONSHIP_OPTIONS,
    },
    {
      id: "healthStatus",
      label: "Health discussion",
      scope: "member",
      type: "select",
      section: "health",
      required: false,
      options: [
        { value: "not-discussed", label: "Not discussed" },
        { value: "no-concerns", label: "No concerns reported" },
        { value: "concerns", label: "Concerns reported" },
      ],
    },
    {
      id: "healthHistory",
      label: "Reported symptoms and health history",
      scope: "member",
      type: "textarea",
      section: "health",
      required: false,
    },
    {
      id: "hypertension",
      label: "High blood pressure reported",
      scope: "member",
      type: "select",
      section: "health",
      required: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unknown", label: "Not known" },
      ],
    },
  ],
};
// Stable ordering is shared by the family and pregnancy-focused questionnaires.
const V2_ORDER = [
  "familySize",
  "name",
  "age",
  "relation",
  "sex",
  "phone",
  "weight",
  "healthStatus",
  "healthHistory",
  "hypertension",
  "feverDays",
  "temperature",
  "breathingDifficulty",
  "pregnancyStatus",
  "pregnancyWeeks",
  "householdNotes",
];
FAMILY_HEALTH_TEMPLATE.fields.sort(
  (a, b) => V2_ORDER.indexOf(a.id) - V2_ORDER.indexOf(b.id),
);
export const PREGNANCY_FOLLOW_UP_TEMPLATE = {
  ...FAMILY_HEALTH_TEMPLATE,
  id: "pregnancy-follow-up",
};
export type SurveyHealthStatus = "not-discussed" | "no-concerns" | "concerns";
export function getMemberHealthStatus(
  member: SurveyAnswerRecord,
): SurveyHealthStatus {
  const value = member.values.healthStatus;
  return value === "no-concerns" || value === "concerns"
    ? value
    : "not-discussed";
}

const nowIso = () => new Date().toISOString();
const blankRecord = (): SurveyAnswerRecord => ({ values: {}, meta: {} });
const isBlank = (value: SurveyValue | undefined) =>
  value == null || (typeof value === "string" && !value.trim());
const cleanComparable = (value: SurveyValue | undefined) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase() : value;
const getRecord = (
  survey: Survey,
  memberId: string | null,
): SurveyAnswerRecord | undefined =>
  memberId === null
    ? survey.household
    : survey.members.find((member) => member.id === memberId);
const getField = (survey: Survey, memberId: string | null, fieldId: string) =>
  survey.fields.find(
    (field) =>
      field.id === fieldId &&
      field.scope === (memberId === null ? "household" : "member"),
  );

export function createSurvey(
  input: {
    householdId: string;
    repeatOf?: string;
    templateId?: "family-health" | "pregnancy-follow-up";
    templateVersion?: 1 | 2;
    kind?: "family" | "pregnancy";
    workspaceGeneration?: string;
  },
  now = nowIso(),
  id = `survey-${crypto.randomUUID()}`,
): Survey {
  const template =
    input.templateVersion === 1
      ? LEGACY_FAMILY_HEALTH_TEMPLATE
      : input.templateId === "pregnancy-follow-up" || input.kind === "pregnancy"
        ? PREGNANCY_FOLLOW_UP_TEMPLATE
        : FAMILY_HEALTH_TEMPLATE;
  return {
    id,
    householdId: input.householdId,
    templateId: template.id,
    templateVersion: template.version,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    status: "draft",
    revision: 0,
    ...(input.repeatOf ? { repeatOf: input.repeatOf } : {}),
    ...(input.workspaceGeneration
      ? { workspaceGeneration: input.workspaceGeneration }
      : {}),
    fields: template.fields.map((field) => ({
      ...field,
      ...(field.options
        ? { options: field.options.map((option) => ({ ...option })) }
        : {}),
    })),
    household: blankRecord(),
    members: [],
    transcripts: [],
    processedSegmentIds: [],
    notes: [],
    conflicts: [],
    uncertainties: [],
    audit: [],
  };
}

export function normalizeSurveyValue(
  field: SurveyFieldDefinition,
  value: SurveyValue,
): SurveyValue {
  if (typeof value === "string") {
    const text = value.trim();
    if (field.type === "number" && /^-?\d+(?:\.\d+)?$/.test(text))
      return Number(text);
    if (field.id === "phone") return text.replace(/[\s()-]/g, "");
    if (field.id === "relation" && field.type === "select")
      return normalizeRelationship(text);
    return text;
  }
  return value;
}

export function validateSurveyValue(
  field: SurveyFieldDefinition,
  input: SurveyValue | undefined,
): string | null {
  if (isBlank(input)) return null;
  const value = normalizeSurveyValue(field, input as SurveyValue);
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return `${field.label} must be a number.`;
    const bounds: Record<string, [number, number, boolean?]> = {
      familySize: [1, 30, true],
      age: [0, 120, true],
      pregnancyWeeks: [1, 45, true],
      feverDays: [0, 365, true],
      temperature: [30, 45],
      weight: [1, 400],
      systolic: [40, 300, true],
      diastolic: [20, 200, true],
    };
    const range = bounds[field.id];
    if (
      range &&
      (value < range[0] ||
        value > range[1] ||
        (range[2] && !Number.isInteger(value)))
    )
      return `Check ${field.label.toLowerCase()}: enter ${range[2] ? "a whole number " : ""}between ${range[0]} and ${range[1]}.`;
    return null;
  }
  if (typeof value !== "string") return `${field.label} must be text.`;
  if (field.id === "name" && (value.length < 2 || value.length > 100))
    return "Enter a name between 2 and 100 characters.";
  if (field.id === "phone" && !/^\d{10}$/.test(value))
    return "Enter a 10-digit phone number.";
  if (
    field.type === "select" &&
    !field.options?.some((option) => option.value === value)
  )
    return `Choose an available ${field.label.toLowerCase()} option.`;
  if (value.length > 4000)
    return `${field.label} must be 4,000 characters or fewer.`;
  return null;
}

export function isSurveyFieldVisible(
  field: SurveyFieldDefinition,
  record: SurveyAnswerRecord,
): boolean {
  if (field.legacy) return false;
  if (field.id === "pregnancyStatus")
    return (
      record.values.sex === "female" ||
      !isBlank(record.values.pregnancyStatus) ||
      !isBlank(record.values.pregnancyWeeks)
    );
  if (
    [
      "healthHistory",
      "hypertension",
      "feverDays",
      "temperature",
      "breathingDifficulty",
    ].includes(field.id)
  )
    return (
      getMemberHealthStatus(record) === "concerns" ||
      !isBlank(record.values[field.id])
    );
  if (field.id === "pregnancyWeeks" && !isBlank(record.values.pregnancyWeeks))
    return true;
  return (
    !field.visibleWhen ||
    cleanComparable(record.values[field.visibleWhen.fieldId]) ===
      cleanComparable(field.visibleWhen.equals)
  );
}
function changeRecord(
  survey: Survey,
  memberId: string | null,
  record: SurveyAnswerRecord,
): Survey {
  return memberId === null
    ? { ...survey, household: record }
    : {
        ...survey,
        members: survey.members.map((member) =>
          member.id === memberId ? { id: member.id, ...record } : member,
        ),
      };
}
function finishMutation(survey: Survey, now: string): Survey {
  return { ...survey, revision: survey.revision + 1, updatedAt: now };
}
function recordAudit(
  survey: Survey,
  memberId: string | null,
  fieldId: string,
  previousValue: SurveyValue,
  value: SurveyValue,
  source: SurveyAuditEntry["source"],
  now: string,
  evidence?: string,
): Survey {
  return {
    ...survey,
    audit: [
      ...survey.audit,
      {
        id: `${survey.id}:audit:${survey.revision + 1}:${survey.audit.length}`,
        timestamp: now,
        memberId,
        fieldId,
        previousValue,
        value,
        source,
        ...(evidence ? { evidence } : {}),
      },
    ],
  };
}
export function surveyMemberHasAnswers(member: SurveyMember): boolean {
  return Object.values(member.values).some((value) => !isBlank(value));
}
function memberHasRecordedContent(
  survey: Survey,
  member: SurveyMember,
): boolean {
  return (
    surveyMemberHasAnswers(member) ||
    survey.notes.some((note) => note.memberId === member.id) ||
    survey.conflicts.some(
      (conflict) => conflict.memberId === member.id && !conflict.resolved,
    ) ||
    survey.uncertainties.some(
      (item) => item.memberId === member.id && !item.resolved,
    )
  );
}
function reconcileFamilySize(survey: Survey, count: number): Survey {
  if (count > survey.members.length) {
    const additions = Array.from(
      { length: count - survey.members.length },
      (_, index) => ({
        id: `${survey.id}:member:${survey.revision + 1}:${index + survey.members.length + 1}`,
        ...blankRecord(),
      }),
    );
    return { ...survey, members: [...survey.members, ...additions] };
  }
  if (count < survey.members.length) {
    const retained = survey.members.filter(
      (member, index) =>
        index < count || memberHasRecordedContent(survey, member),
    );
    return { ...survey, members: retained };
  }
  return survey;
}

export function editSurveyField(
  survey: Survey,
  memberId: string | null,
  fieldId: string,
  value: SurveyValue,
  now = nowIso(),
): Survey {
  if (survey.status !== "draft") return survey;
  const record = getRecord(survey, memberId);
  const field = getField(survey, memberId, fieldId);
  if (!record || !field || !valueSchema.safeParse(value).success) return survey;
  if (
    fieldId === "relation" &&
    field.type === "select" &&
    typeof value === "string"
  )
    value = normalizeRelationship(value);
  const previousValue = record.values[fieldId] ?? null;
  if (previousValue === value && record.meta[fieldId]?.manuallyProtected)
    return survey;
  let next = changeRecord(survey, memberId, {
    values: { ...record.values, [fieldId]: value },
    meta: {
      ...record.meta,
      [fieldId]: {
        source: "manual",
        manuallyProtected: true,
        revision: survey.revision + 1,
        segmentIndex: record.meta[fieldId]?.segmentIndex ?? -1,
      },
    },
  });
  next = {
    ...next,
    conflicts: next.conflicts.map((conflict) =>
      conflict.memberId === memberId &&
      conflict.fieldId === fieldId &&
      !conflict.resolved
        ? { ...conflict, resolved: true }
        : conflict,
    ),
  };
  if (
    memberId === null &&
    fieldId === "familySize" &&
    !validateSurveyValue(field, value) &&
    !isBlank(value)
  )
    next = reconcileFamilySize(
      next,
      Number(normalizeSurveyValue(field, value)),
    );
  if (memberId !== null && fieldId === "relation")
    next = autofillRelationshipSex(next, memberId, now);
  return finishMutation(
    recordAudit(next, memberId, fieldId, previousValue, value, "manual", now),
    now,
  );
}

export function addSurveyMember(survey: Survey, now = nowIso()): Survey {
  if (survey.status !== "draft") return survey;
  if (survey.members.length >= 30)
    throw new Error("A survey supports up to 30 family members.");
  return editSurveyField(
    survey,
    null,
    "familySize",
    survey.members.length + 1,
    now,
  );
}
export function removeSurveyMember(
  survey: Survey,
  memberId: string,
  confirmAnswered = false,
  now = nowIso(),
): Survey {
  if (survey.status !== "draft") return survey;
  const member = survey.members.find((item) => item.id === memberId);
  if (!member) return survey;
  if (memberHasRecordedContent(survey, member) && !confirmAnswered)
    throw new Error(
      "This member has recorded answers. Confirm removal to remove this section.",
    );
  let next: Survey = {
    ...survey,
    members: survey.members.filter((item) => item.id !== memberId),
    conflicts: survey.conflicts.map((item) =>
      item.memberId === memberId ? { ...item, resolved: true } : item,
    ),
    uncertainties: survey.uncertainties.map((item) =>
      item.memberId === memberId ? { ...item, resolved: true } : item,
    ),
    notes: survey.notes.map((note) =>
      note.memberId === memberId
        ? { ...note, memberId: null, reviewed: false }
        : note,
    ),
  };
  next = recordAudit(
    next,
    memberId,
    "member",
    String(member.values.name ?? "Unnamed member"),
    null,
    "manual",
    now,
  );
  // Zero is an intentionally incomplete draft after removing the last member.
  return editSurveyField(next, null, "familySize", next.members.length, now);
}

export function addCustomSurveyField(
  survey: Survey,
  input: {
    label: string;
    scope: "household" | "member";
    type: SurveyFieldType;
    required?: boolean;
    options?: { value: string; label: string }[];
    section?: SurveyFieldDefinition["section"];
  },
  now = nowIso(),
): Survey {
  if (survey.status !== "draft") return survey;
  if (survey.fields.length >= 100)
    throw new Error("This survey already has the maximum number of fields.");
  const field: SurveyFieldDefinition = {
    id: `custom-${survey.revision + 1}-${survey.fields.length + 1}`,
    label: input.label.trim(),
    scope: input.scope,
    type: input.type,
    required: input.required ?? false,
    section:
      input.section ?? (input.scope === "household" ? "household" : "health"),
    custom: true,
    ...(input.options ? { options: input.options } : {}),
  };
  const parsed = surveyFieldSchema.safeParse(field);
  if (!parsed.success || (field.type === "select" && !field.options?.length))
    throw new Error("Give the field a label and valid input options.");
  if (
    survey.fields.some(
      (existing) =>
        existing.scope === field.scope &&
        existing.label.toLocaleLowerCase() === field.label.toLocaleLowerCase(),
    )
  )
    throw new Error("A field with this label already exists.");
  return finishMutation(
    { ...survey, fields: [...survey.fields, parsed.data] },
    now,
  );
}

export function addSurveyTranscript(
  survey: Survey,
  input: SurveyTranscript,
  now = nowIso(),
): Survey {
  if (survey.status !== "draft") return survey;
  const parsed = surveyTranscriptSchema.safeParse(input);
  if (
    !parsed.success ||
    survey.transcripts.some(
      (item) => item.id === input.id || item.index === input.index,
    )
  )
    return survey;
  if (survey.transcripts.length >= 2000)
    throw new Error(
      "This survey has reached its transcript limit. Finish this survey before recording more.",
    );
  return finishMutation(
    { ...survey, transcripts: [...survey.transcripts, parsed.data] },
    now,
  );
}

function addUncertainty(
  survey: Survey,
  segment: SurveyTranscript,
  message: string,
  evidence: string,
  memberId: string | null = null,
): Survey {
  if (
    survey.uncertainties.some(
      (item) =>
        item.segmentId === segment.id &&
        item.message === message &&
        item.evidence === evidence,
    )
  )
    return survey;
  const item: SurveyUncertainty = {
    id: `${survey.id}:uncertain:${segment.index}:${survey.uncertainties.length}`,
    message,
    evidence,
    memberId,
    resolved: false,
    segmentId: segment.id,
  };
  return { ...survey, uncertainties: [...survey.uncertainties, item] };
}
function exactEvidence(
  segment: SurveyTranscript,
  evidence: string | null | undefined,
): evidence is string {
  return (
    typeof evidence === "string" &&
    evidence.trim().length > 0 &&
    segment.text.includes(evidence)
  );
}
function findMemberForProposal(
  survey: Survey,
  proposal: z.infer<typeof extractedSurveyMemberSchema>,
): SurveyMember | undefined {
  if (proposal.memberId)
    return survey.members.find((member) => member.id === proposal.memberId);
  if (proposal.slot != null) return survey.members[proposal.slot - 1];
  if (proposal.name?.trim()) {
    const matches = survey.members.filter(
      (member) =>
        cleanComparable(member.values.name) === cleanComparable(proposal.name),
    );
    if (matches.length === 1) return matches[0];
  }
  if (proposal.relation?.trim()) {
    const matches = survey.members.filter(
      (member) =>
        cleanComparable(member.values.relation) ===
        cleanComparable(proposal.relation),
    );
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

/** Exact evidence and explicit member references are required; semantic accuracy remains reviewable. */
export function applySurveyExtraction(
  survey: Survey,
  envelope: SurveyExtractionEnvelope,
  protectedKeys: string[] = [],
  now = nowIso(),
): Survey {
  if (
    survey.status !== "draft" ||
    envelope.surveyId !== survey.id ||
    !Number.isInteger(envelope.baseRevision) ||
    envelope.baseRevision < 0 ||
    envelope.baseRevision > survey.revision ||
    (envelope.mode !== "reconcile" &&
      survey.processedSegmentIds.includes(envelope.segmentId))
  )
    return survey;
  const segment = survey.transcripts.find(
    (item) =>
      item.id === envelope.segmentId && item.index === envelope.segmentIndex,
  );
  const parsed = surveyExtractionSchema.safeParse(envelope.result);
  if (!segment || !parsed.success) return survey;
  const result = parsed.data;
  const fillOnly = envelope.mode === "reconcile";
  const active = new Set(protectedKeys);
  const touched = new Set<string>();
  let next = survey;

  const propose = (
    memberId: string | null,
    fieldId: string,
    input: SurveyValue,
    evidence: string,
    correction?: z.infer<typeof surveyCorrectionSchema>,
  ) => {
    if (input === null) return;
    if (!exactEvidence(segment, evidence)) {
      next = addUncertainty(
        next,
        segment,
        `A proposed ${fieldId} answer has no matching transcript evidence.`,
        segment.text.slice(0, 8000),
        memberId,
      );
      return;
    }
    const record = getRecord(next, memberId);
    const field = getField(next, memberId, fieldId);
    if (!record || !field || field.legacy) {
      next = addUncertainty(
        next,
        segment,
        "A proposed answer does not match a field in this survey. Add or select the correct field manually.",
        evidence,
        memberId,
      );
      return;
    }
    const key = `${memberId ?? "household"}.${fieldId}`;
    if (touched.has(key)) {
      next = addUncertainty(
        next,
        segment,
        `More than one answer was proposed for ${field.label.toLowerCase()} in this segment. Review the source.`,
        evidence,
        memberId,
      );
      return;
    }
    touched.add(key);
    const meta = record.meta[fieldId];
    const currentValue = record.values[fieldId] ?? null;
    if (
      fillOnly &&
      (!isBlank(currentValue) ||
        meta?.manuallyProtected ||
        active.has(key) ||
        (meta?.revision ?? 0) > envelope.baseRevision)
    )
      return;
    if (meta && meta.segmentIndex >= segment.index) return;
    let value = normalizeSurveyValue(field, input);
    if (
      [
        "symptoms",
        "conditions",
        "notes",
        "householdNotes",
        "healthHistory",
      ].includes(fieldId)
    )
      value = evidence;
    const correctiveQuote =
      correction &&
      correction.fieldId === fieldId &&
      exactEvidence(segment, correction.evidence) &&
      /actually|actual|sorry|correct|instead|\bnot\b|rather|असल|सही|नहीं|नही|गलत|ಅಲ್ಲ|ತಪ್ಪು|ಬದಲಿಗೆ|ಸರಿಯಾಗಿ|ಇಲ್ಲ|కాదు|తప్పు|இல்லை|தவறு|അല്ല|തെറ്റ്/iu.test(
        correction.evidence,
      );
    const validCorrection =
      !!correctiveQuote &&
      normalizeSurveyValue(field, correction!.previousValue) ===
        normalizeSurveyValue(field, currentValue);
    if (
      ["healthHistory", "householdNotes"].includes(fieldId) &&
      !fillOnly &&
      !isBlank(currentValue) &&
      !validCorrection &&
      typeof currentValue === "string" &&
      typeof value === "string"
    ) {
      value = currentValue.split("\n").includes(value)
        ? currentValue
        : `${currentValue}\n${value}`;
    }
    if (!valueSchema.safeParse(value).success) {
      next = addUncertainty(
        next,
        segment,
        `The reported ${field.label.toLowerCase()} is too long for one field. Review the original transcript.`,
        evidence,
        memberId,
      );
      return;
    }
    // Preserve the latest source order even if the candidate remains unresolved.
    next = changeRecord(next, memberId, {
      ...record,
      meta: {
        ...record.meta,
        [fieldId]: {
          source: meta?.source ?? "extracted",
          revision: meta?.revision ?? survey.revision,
          manuallyProtected: meta?.manuallyProtected ?? false,
          segmentIndex: segment.index,
          ...(meta?.evidence ? { evidence: meta.evidence } : {}),
          ...(meta?.segmentId ? { segmentId: meta.segmentId } : {}),
        },
      },
    });
    const problem = validateSurveyValue(field, value);
    const protectedByWorker = meta?.manuallyProtected || active.has(key);
    const equivalent = normalizeSurveyValue(field, currentValue) === value;
    const needsCorrection =
      survey.templateVersion >= 2 &&
      !fillOnly &&
      !isBlank(currentValue) &&
      !equivalent &&
      !["healthHistory", "householdNotes"].includes(fieldId) &&
      meta?.source !== "derived" &&
      !validCorrection;
    if (problem || (protectedByWorker && !equivalent) || needsCorrection) {
      const conflict: SurveyConflict = {
        id: `${survey.id}:conflict:${segment.index}:${next.conflicts.length}`,
        memberId,
        fieldId,
        currentValue,
        proposedValue: value,
        evidence,
        reason:
          problem ??
          (active.has(key)
            ? "This field is being edited. Your entry was kept."
            : protectedByWorker
              ? "Your manual answer was kept. Review the suggested change."
              : "An existing answer differs. Confirm this correction before replacing it."),
        resolved: false,
      };
      next = {
        ...next,
        conflicts: [
          ...next.conflicts.map((item) =>
            item.memberId === memberId &&
            item.fieldId === fieldId &&
            !item.resolved
              ? { ...item, resolved: true }
              : item,
          ),
          conflict,
        ],
      };
      return;
    }
    if (protectedByWorker) return;
    const current = getRecord(next, memberId)!;
    next = changeRecord(next, memberId, {
      values: { ...current.values, [fieldId]: value },
      meta: {
        ...current.meta,
        [fieldId]: {
          source: "extracted",
          revision: survey.revision + 1,
          segmentIndex: segment.index,
          manuallyProtected: false,
          evidence,
          segmentId: segment.id,
        },
      },
    });
    next = {
      ...next,
      conflicts: next.conflicts.map((item) =>
        item.memberId === memberId && item.fieldId === fieldId && !item.resolved
          ? { ...item, resolved: true }
          : item,
      ),
    };
    if (!equivalent)
      next = recordAudit(
        next,
        memberId,
        fieldId,
        currentValue,
        value,
        "extracted",
        now,
        evidence,
      );
    if (memberId === null && fieldId === "familySize")
      next = reconcileFamilySize(next, Number(value));
  };

  if (result.familySize !== null) {
    if (exactEvidence(segment, result.familySizeEvidence))
      propose(
        null,
        "familySize",
        result.familySize,
        result.familySizeEvidence,
        result.familySizeCorrection
          ? { ...result.familySizeCorrection, fieldId: "familySize" }
          : undefined,
      );
    else
      next = addUncertainty(
        next,
        segment,
        "The proposed family size needs a matching source quote. Confirm the family count manually.",
        segment.text.slice(0, 8000),
      );
  }
  for (const field of result.householdFields ?? [])
    propose(null, field.fieldId, field.value, field.evidence);
  const memberFields = [
    "name",
    "age",
    "relation",
    "sex",
    "phone",
    "healthStatus",
    "healthHistory",
    "hypertension",
    "symptoms",
    "conditions",
    "pregnancyStatus",
    "pregnancyWeeks",
    "temperature",
    "feverDays",
    "breathingDifficulty",
    "systolic",
    "diastolic",
    "weight",
    "notes",
  ] as const;
  for (const proposal of result.members) {
    if (!exactEvidence(segment, proposal.evidence)) {
      next = addUncertainty(
        next,
        segment,
        "A proposed member answer has no matching source quote. Review this transcript.",
        segment.text.slice(0, 8000),
      );
      continue;
    }
    if (proposal.uncertain) {
      next = addUncertainty(
        next,
        segment,
        "The person or meaning of this answer is uncertain. Assign the information manually after checking it.",
        proposal.evidence,
      );
      continue;
    }
    // Slots describe the section order at request time. A manual or earlier
    // extraction count change may have moved them while this request was pending.
    if (
      !proposal.memberId &&
      proposal.slot != null &&
      (survey.household.meta.familySize?.revision ?? 0) > envelope.baseRevision
    ) {
      next = addUncertainty(
        next,
        segment,
        "Family sections changed while this answer was being processed. Assign this information to the correct member manually.",
        proposal.evidence,
      );
      continue;
    }
    const member = findMemberForProposal(next, proposal);
    if (!member) {
      next = addUncertainty(
        next,
        segment,
        "This information could not be assigned to a family member with confidence. Select the correct member and enter the answer.",
        proposal.evidence,
      );
      continue;
    }
    if (
      proposal.memberId &&
      proposal.slot != null &&
      next.members[proposal.slot - 1]?.id !== proposal.memberId
    ) {
      next = addUncertainty(
        next,
        segment,
        "The proposed member ID and section number disagree. Review the member assignment.",
        proposal.evidence,
      );
      continue;
    }
    // A section number alone cannot authorize replacing an established identity.
    // Name corrections require the stable member ID; otherwise all facts in the
    // proposal may belong to a different person and must stay unassigned.
    if (
      !proposal.memberId &&
      proposal.slot != null &&
      !isBlank(proposal.name) &&
      !isBlank(member.values.name) &&
      cleanComparable(proposal.name) !== cleanComparable(member.values.name)
    ) {
      next = addUncertainty(
        next,
        segment,
        "This section already belongs to a different name. Confirm which family member this information describes before entering it.",
        proposal.evidence,
        member.id,
      );
      continue;
    }
    const attributionIssue = attributionProblem(
      next,
      member,
      proposal,
      segment,
      false,
    );
    if (attributionIssue) {
      next = addUncertainty(
        next,
        segment,
        attributionIssue,
        proposal.evidence,
        member.id,
      );
      continue;
    }
    const proposeMemberField = (
      fieldId: string,
      value: SurveyValue,
      evidence: string,
    ) => {
      const problem = attributionProblem(
        next,
        member,
        { ...proposal, evidence },
        segment,
      );
      if (problem) {
        next = addUncertainty(next, segment, problem, evidence, member.id);
        return;
      }
      propose(
        member.id,
        fieldId,
        value,
        evidence,
        proposal.corrections?.find((item) => item.fieldId === fieldId),
      );
    };
    for (const fieldId of memberFields) {
      const value = proposal[fieldId];
      if (value !== undefined && value !== null)
        proposeMemberField(
          fieldId,
          value,
          proposal.fieldEvidence?.[fieldId] ?? proposal.evidence,
        );
    }
    for (const field of proposal.customFields ?? [])
      proposeMemberField(field.fieldId, field.value, field.evidence);
    next = autofillRelationshipSex(next, member.id, now);
  }
  for (const note of result.notes) {
    if (!exactEvidence(segment, note.evidence)) {
      next = addUncertainty(
        next,
        segment,
        "A proposed note has no matching source quote. Review this transcript.",
        segment.text.slice(0, 8000),
      );
      continue;
    }
    if (note.evidence.length > 4000) {
      next = addUncertainty(
        next,
        segment,
        "A reported note is too long for one field. Review the original transcript.",
        note.evidence,
      );
      continue;
    }
    const noteMember = note.memberId
      ? next.members.find((member) => member.id === note.memberId)
      : undefined;
    const noteProblem = note.memberId
      ? !noteMember
        ? "A note refers to an unknown family member. It was kept without an assignment."
        : attributionProblem(
            next,
            noteMember,
            {
              memberId: note.memberId,
              evidence: note.evidence,
              attribution: note.attribution,
            },
            segment,
          )
      : null;
    if (noteProblem)
      next = addUncertainty(next, segment, noteProblem, note.evidence);
    const memberId = noteProblem ? null : (note.memberId ?? null);
    if (
      !next.notes.some(
        (item) => item.memberId === memberId && item.evidence === note.evidence,
      )
    ) {
      next = {
        ...next,
        notes: [
          ...next.notes,
          {
            id: `${survey.id}:note:${segment.index}:${next.notes.length}`,
            text: note.evidence,
            evidence: note.evidence,
            memberId,
            source: "extracted",
            segmentId: segment.id,
            reviewed: false,
          },
        ],
      };
    }
  }
  if (survey.templateVersion >= 2) {
    const existingNoteIds = new Set(survey.notes.map((note) => note.id));
    const additions = next.notes.filter(
      (note) => !existingNoteIds.has(note.id),
    );
    next = projectConversationNotes(
      survey,
      next,
      additions,
      segment,
      envelope.baseRevision,
      active,
      fillOnly,
      now,
    );
  }
  for (const item of result.uncertainties ?? []) {
    if (exactEvidence(segment, item.evidence))
      next = addUncertainty(next, segment, item.text, item.evidence);
  }
  if (fillOnly) return next === survey ? survey : finishMutation(next, now);
  return finishMutation(
    { ...next, processedSegmentIds: [...next.processedSegmentIds, segment.id] },
    now,
  );
}

/** One visible household notes field; internal records retain precise quotes for review. */
function projectConversationNotes(
  original: Survey,
  survey: Survey,
  notes: SurveyNote[],
  segment: SurveyTranscript,
  baseRevision: number,
  active: Set<string>,
  fillOnly: boolean,
  now: string,
): Survey {
  if (!notes.length) return survey;
  const record = survey.household,
    meta = record.meta.householdNotes,
    originalMeta = original.household.meta.householdNotes;
  const currentValue = record.values.householdNotes ?? null;
  if ((originalMeta?.segmentIndex ?? -1) >= segment.index) return survey;
  if (
    fillOnly &&
    (!isBlank(currentValue) ||
      meta?.manuallyProtected ||
      active.has("household.householdNotes") ||
      (meta?.revision ?? 0) > baseRevision)
  )
    return survey;
  const pending = survey.conflicts.findLast(
    (item) =>
      item.memberId === null &&
      item.fieldId === "householdNotes" &&
      !item.resolved,
  );
  let proposed =
    typeof pending?.proposedValue === "string"
      ? pending.proposedValue
      : String(currentValue ?? "");
  for (const note of notes) {
    if (proposed.includes(note.evidence)) continue;
    const member = note.memberId
      ? survey.members.find((item) => item.id === note.memberId)
      : undefined;
    const quote = member?.values.name
      ? `${member.values.name}: ${note.evidence}`
      : note.evidence;
    proposed = proposed ? `${proposed}\n\n${quote}` : quote;
  }
  if (proposed === String(currentValue ?? "")) return survey;
  const evidence =
    segment.text.length <= 8000 ? segment.text : notes[0].evidence;
  if (proposed.length > 4000)
    return addUncertainty(
      survey,
      segment,
      "The additional notes exceed the notes field limit. Their original passages are retained in the conversation review.",
      evidence,
    );
  if (meta?.manuallyProtected || active.has("household.householdNotes")) {
    const conflict: SurveyConflict = {
      id: `${survey.id}:conflict:${segment.index}:${survey.conflicts.length}`,
      memberId: null,
      fieldId: "householdNotes",
      currentValue,
      proposedValue: proposed,
      evidence,
      reason:
        "Your household notes were kept. Review the additional notes from the conversation.",
      resolved: false,
    };
    return {
      ...survey,
      conflicts: [
        ...survey.conflicts.map((item) =>
          item.memberId === null &&
          item.fieldId === "householdNotes" &&
          !item.resolved
            ? { ...item, resolved: true }
            : item,
        ),
        conflict,
      ],
    };
  }
  let next: Survey = {
    ...survey,
    household: {
      values: { ...record.values, householdNotes: proposed },
      meta: {
        ...record.meta,
        householdNotes: {
          source: "extracted",
          revision: original.revision + 1,
          segmentIndex: segment.index,
          segmentId: segment.id,
          evidence,
          manuallyProtected: false,
        },
      },
    },
  };
  next = recordAudit(
    next,
    null,
    "householdNotes",
    currentValue,
    proposed,
    "extracted",
    now,
    evidence,
  );
  return next;
}

/** Whole-transcript reconciliation can only fill still-missing, unprotected values. */
export function applySurveyReconciliation(
  survey: Survey,
  envelope: SurveyExtractionEnvelope,
  protectedKeys: string[] = [],
  now = nowIso(),
): Survey {
  return applySurveyExtraction(
    survey,
    { ...envelope, mode: "reconcile" },
    protectedKeys,
    now,
  );
}

export function resolveSurveyConflict(
  survey: Survey,
  conflictId: string,
  choice: "keep" | "accept",
  now = nowIso(),
): Survey {
  if (survey.status !== "draft") return survey;
  const conflict = survey.conflicts.find(
    (item) => item.id === conflictId && !item.resolved,
  );
  if (!conflict) return survey;
  const record = getRecord(survey, conflict.memberId);
  const field = getField(survey, conflict.memberId, conflict.fieldId);
  if (!record || !field) return survey;
  const value =
    choice === "accept"
      ? conflict.proposedValue
      : (record.values[conflict.fieldId] ?? null);
  if (choice === "accept") {
    const problem = validateSurveyValue(field, value);
    if (problem) throw new Error(problem);
  }
  let next = editSurveyField(
    survey,
    conflict.memberId,
    conflict.fieldId,
    value,
    now,
  );
  // A keep action must resolve a conflict even when its protected value is unchanged.
  if (next === survey)
    next = finishMutation(
      {
        ...survey,
        conflicts: survey.conflicts.map((item) =>
          item.id === conflictId ? { ...item, resolved: true } : item,
        ),
      },
      now,
    );
  const audit = next.audit.at(-1);
  if (audit && next.audit.length > survey.audit.length)
    next = {
      ...next,
      audit: [
        ...next.audit.slice(0, -1),
        { ...audit, source: "resolution", evidence: conflict.evidence },
      ],
    };
  return next;
}
export function resolveSurveyUncertainty(
  survey: Survey,
  uncertaintyId: string,
  now = nowIso(),
): Survey {
  if (
    survey.status !== "draft" ||
    !survey.uncertainties.some(
      (item) => item.id === uncertaintyId && !item.resolved,
    )
  )
    return survey;
  return finishMutation(
    {
      ...survey,
      uncertainties: survey.uncertainties.map((item) =>
        item.id === uncertaintyId ? { ...item, resolved: true } : item,
      ),
    },
    now,
  );
}
export function reviewSurveyNote(
  survey: Survey,
  noteId: string,
  now = nowIso(),
): Survey {
  if (
    survey.status !== "draft" ||
    !survey.notes.some((item) => item.id === noteId && !item.reviewed)
  )
    return survey;
  return finishMutation(
    {
      ...survey,
      notes: survey.notes.map((item) =>
        item.id === noteId ? { ...item, reviewed: true } : item,
      ),
    },
    now,
  );
}

export function reviewSurvey(survey: Survey): SurveyReviewIssue[] {
  const issues: SurveyReviewIssue[] = [];
  const records: [string | null, SurveyAnswerRecord][] = [
    [null, survey.household],
    ...survey.members.map(
      (member) => [member.id, member] as [string, SurveyAnswerRecord],
    ),
  ];
  for (const [memberId, record] of records) {
    for (const field of survey.fields.filter(
      (item) => item.scope === (memberId === null ? "household" : "member"),
    )) {
      if (field.legacy) continue;
      const visible = isSurveyFieldVisible(field, record);
      const value = record.values[field.id];
      if (visible && field.required && isBlank(value))
        issues.push({
          id: `${memberId ?? "household"}:${field.id}:required`,
          memberId,
          fieldId: field.id,
          kind: "missing",
          message: `${field.label} is required.`,
        });
      const problem = validateSurveyValue(field, value);
      if (problem)
        issues.push({
          id: `${memberId ?? "household"}:${field.id}:invalid`,
          memberId,
          fieldId: field.id,
          kind: "invalid",
          message: problem,
        });
    }
    if (memberId !== null) {
      const pregnancy = cleanComparable(record.values.pregnancyStatus);
      if (
        (pregnancy === "no" || pregnancy === "not-applicable") &&
        !isBlank(record.values.pregnancyWeeks)
      )
        issues.push({
          id: `${memberId}:pregnancy:contradiction`,
          memberId,
          fieldId: "pregnancyWeeks",
          kind: "invalid",
          message:
            "Gestational age conflicts with pregnancy status. Review both answers.",
        });
      if (
        pregnancy !== "yes" &&
        pregnancy !== "no" &&
        pregnancy !== "not-applicable" &&
        !isBlank(record.values.pregnancyWeeks)
      )
        issues.push({
          id: `${memberId}:pregnancy:unconfirmed`,
          memberId,
          fieldId: "pregnancyStatus",
          kind: "invalid",
          message:
            "Gestational age was recorded without a confirmed pregnancy status. Review both answers.",
        });
      const systolic =
        survey.templateVersion < 2 ? record.values.systolic : null;
      const diastolic =
        survey.templateVersion < 2 ? record.values.diastolic : null;
      if (isBlank(systolic) !== isBlank(diastolic))
        issues.push({
          id: `${memberId}:blood-pressure:partial`,
          memberId,
          fieldId: isBlank(systolic) ? "systolic" : "diastolic",
          kind: "missing",
          message:
            "Record both blood pressure values, or clear the partial measurement.",
        });
      if (
        !isBlank(systolic) &&
        !isBlank(diastolic) &&
        Number(diastolic) >= Number(systolic)
      )
        issues.push({
          id: `${memberId}:blood-pressure:inverted`,
          memberId,
          fieldId: "diastolic",
          kind: "invalid",
          message:
            "Check the blood pressure values: systolic should be higher than diastolic.",
        });
    }
  }
  const size = Number(survey.household.values.familySize);
  if (survey.members.length !== size || !survey.members.length)
    issues.push({
      id: "family-count",
      memberId: null,
      fieldId: "familySize",
      kind: "count",
      message:
        survey.members.length > size
          ? `The family count is ${size}, but ${survey.members.length} member sections remain. Recorded answers were kept. Correct the count or explicitly remove surplus members.`
          : "Confirm the family count and create the matching member sections.",
    });
  for (const conflict of survey.conflicts)
    if (!conflict.resolved)
      issues.push({
        id: conflict.id,
        memberId: conflict.memberId,
        fieldId: conflict.fieldId,
        kind: "conflict",
        message: conflict.reason,
      });
  for (const item of survey.uncertainties)
    if (!item.resolved)
      issues.push({
        id: item.id,
        memberId: item.memberId,
        kind: "uncertain",
        message: item.message,
      });
  for (const note of survey.notes)
    if (!note.reviewed)
      issues.push({
        id: note.id,
        memberId: note.memberId,
        kind: "uncertain",
        message:
          "Review the additional information recorded from the conversation.",
      });
  return issues;
}
export function completeSurvey(survey: Survey, now = nowIso()): Survey {
  if (survey.status === "completed") return survey;
  const issues = reviewSurvey(survey);
  if (issues.length)
    throw new Error(
      `Review ${issues.length} ${issues.length === 1 ? "item" : "items"} before completing the survey.`,
    );
  return finishMutation(
    { ...survey, status: "completed", completedAt: now },
    now,
  );
}

/** Compact, explicit extraction context; no full audit/history is sent to the model. */
export function makeExtractionContext(
  survey: Survey,
  segment: SurveyTranscript,
) {
  return {
    surveyId: survey.id,
    templateId: survey.templateId,
    templateVersion: survey.templateVersion,
    baseRevision: survey.revision,
    segment: {
      id: segment.id,
      index: segment.index,
      text: segment.text,
      language: segment.language,
    },
    fields: survey.fields
      .filter((field) => !field.legacy)
      .map(({ id, label, scope, type, options, unit, visibleWhen }) => ({
        id,
        label,
        scope,
        type,
        ...(options ? { options } : {}),
        ...(unit ? { unit } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
      })),
    household: survey.household.values,
    members: survey.members.map((member, index) => ({
      memberId: member.id,
      slot: index + 1,
      values: member.values,
    })),
    recentTranscript: survey.transcripts
      .filter((item) => item.index < segment.index)
      .slice(-8)
      .map((item) => ({ index: item.index, text: item.text })),
  };
}

/** Only relationship-derived defaults may be revised by a later relationship. */
function autofillRelationshipSex(
  survey: Survey,
  memberId: string,
  now: string,
): Survey {
  const member = survey.members.find((item) => item.id === memberId);
  if (!member || survey.templateVersion < 2) return survey;
  const relation =
    typeof member.values.relation === "string" ? member.values.relation : "";
  const inferred = relationshipSex(relation);
  const previous = member.values.sex ?? null;
  const priorMeta = member.meta.sex;
  if (
    !isBlank(previous) &&
    !(
      priorMeta?.source === "derived" &&
      priorMeta.derivedFrom === "relation" &&
      !priorMeta.manuallyProtected
    )
  )
    return survey;
  if (priorMeta?.manuallyProtected) return survey;
  if (previous === inferred || (isBlank(previous) && inferred === null))
    return survey;
  const relationMeta = member.meta.relation;
  const next = changeRecord(survey, memberId, {
    values: { ...member.values, sex: inferred },
    meta: {
      ...member.meta,
      sex: {
        source: "derived",
        derivedFrom: "relation",
        revision: survey.revision + 1,
        segmentIndex: relationMeta?.segmentIndex ?? -1,
        manuallyProtected: false,
        ...(relationMeta?.evidence ? { evidence: relationMeta.evidence } : {}),
        ...(relationMeta?.segmentId
          ? { segmentId: relationMeta.segmentId }
          : {}),
      },
    },
  });
  return recordAudit(
    next,
    memberId,
    "sex",
    previous,
    inferred,
    "derived",
    now,
    relationMeta?.evidence,
  );
}

/** Migrates only drafts; original legacy answers remain available for historical review/export. */
export function migrateDraftSurvey(survey: Survey, now = nowIso()): Survey {
  if (survey.status !== "draft" || survey.templateVersion >= 2) return survey;
  const template =
    survey.templateId === "pregnancy-follow-up"
      ? PREGNANCY_FOLLOW_UP_TEMPLATE
      : FAMILY_HEALTH_TEMPLATE;
  const currentIds = new Set(template.fields.map((field) => field.id));
  const fields: SurveyFieldDefinition[] = [
    ...template.fields.map((field) => ({
      ...field,
      ...(field.options
        ? { options: field.options.map((option) => ({ ...option })) }
        : {}),
    })),
    ...survey.fields
      .filter((field) => !currentIds.has(field.id))
      .map((field) =>
        field.custom
          ? { ...field }
          : { ...field, legacy: true, required: false },
      ),
  ];
  let next: Survey = {
    ...survey,
    templateVersion: 2,
    fields,
    household: {
      values: { ...survey.household.values },
      meta: { ...survey.household.meta },
    },
    members: survey.members.map((member) => ({
      id: member.id,
      values: { ...member.values },
      meta: { ...member.meta },
    })),
    notes: [...survey.notes],
  };
  for (let index = 0; index < next.members.length; index++) {
    let member = next.members[index];
    const relation = member.values.relation;
    if (typeof relation === "string" && !isBlank(relation)) {
      const normalized = normalizeRelationship(relation);
      const definition = next.fields.find((field) => field.id === "relation")!;
      if (!definition.options?.some((option) => option.value === normalized))
        definition.options = [
          ...(definition.options ?? []),
          { value: normalized, label: relation },
        ];
      if (normalized !== relation) {
        member = {
          ...member,
          values: { ...member.values, relation: normalized },
        };
        next = {
          ...next,
          members: next.members.map((item) =>
            item.id === member.id ? member : item,
          ),
        };
        next = recordAudit(
          next,
          member.id,
          "relation",
          relation,
          normalized,
          "migration",
          now,
        );
      }
    }
    const historyParts = ["symptoms", "conditions"]
      .map((key) => member.values[key])
      .filter(
        (value): value is string => typeof value === "string" && !!value.trim(),
      );
    const history = [...new Set(historyParts)].join("\n");
    if (history && !member.values.healthHistory && history.length <= 4000) {
      const priorMetas = ["symptoms", "conditions"]
        .map((key) => member.meta[key])
        .filter(Boolean);
      member = {
        ...member,
        values: { ...member.values, healthHistory: history },
        meta: {
          ...member.meta,
          healthHistory: {
            source: "migration",
            revision: survey.revision + 1,
            segmentIndex: Math.max(
              -1,
              ...priorMetas.map((meta) => meta.segmentIndex),
            ),
            manuallyProtected: priorMetas.some(
              (meta) => meta.manuallyProtected,
            ),
            evidence: history,
          },
        },
      };
      next = {
        ...next,
        members: next.members.map((item) =>
          item.id === member.id ? member : item,
        ),
      };
    }
    const legacyNote = member.values.notes;
    if (typeof legacyNote === "string" && legacyNote.trim()) {
      const named = `${member.values.name || `Member ${index + 1}`}: ${legacyNote}`;
      const previous = String(next.household.values.householdNotes ?? "");
      const joined = previous ? `${previous}\n\n${named}` : named;
      if (joined.length <= 4000)
        next = {
          ...next,
          household: {
            values: { ...next.household.values, householdNotes: joined },
            meta: {
              ...next.household.meta,
              householdNotes: {
                source: "migration",
                revision: survey.revision + 1,
                segmentIndex: -1,
                manuallyProtected:
                  !!next.household.meta.householdNotes?.manuallyProtected ||
                  !!member.meta.notes?.manuallyProtected,
              },
            },
          },
        };
      else if (
        !next.notes.some(
          (note) => note.id === `${survey.id}:migration-note:${index}`,
        )
      )
        next.notes.push({
          id: `${survey.id}:migration-note:${index}`,
          text: legacyNote,
          evidence: legacyNote,
          memberId: member.id,
          source:
            member.meta.notes?.source === "extracted" ? "extracted" : "manual",
          reviewed: false,
        });
    }
    next = autofillRelationshipSex(next, member.id, now);
  }
  return finishMutation(next, now);
}

function attributionProblem(
  survey: Survey,
  member: SurveyMember,
  proposal: z.infer<typeof extractedSurveyMemberSchema>,
  segment: SurveyTranscript,
  checkAnswer = true,
): string | null {
  if (survey.templateVersion < 2) return null;
  const proof = proposal.attribution;
  if (!proof)
    return "The person reference is missing. Confirm which member this information describes.";
  const proofSegment = survey.transcripts.find(
    (item) => item.id === proof.segmentId,
  );
  if (
    !proofSegment ||
    proofSegment.index > segment.index ||
    !exactEvidence(proofSegment, proof.evidence)
  )
    return "The person reference does not match an original transcript passage.";
  const knownName =
    typeof member.values.name === "string" ? member.values.name : "";
  const knownRelation =
    typeof member.values.relation === "string"
      ? normalizeRelationship(member.values.relation)
      : "";
  let supported = false;
  if (proof.kind === "introduction")
    supported =
      isBlank(knownName) &&
      ((!!proposal.name &&
        normalizeIdentityText(proof.reference) ===
          normalizeIdentityText(proposal.name) &&
        containsIdentityReference(proof.evidence, proof.reference)) ||
        (!!proposal.relation &&
          (!knownRelation ||
            knownRelation === normalizeRelationship(proposal.relation)) &&
          normalizeRelationship(proof.reference) ===
            normalizeRelationship(proposal.relation) &&
          evidenceSupportsRelationship(proof.evidence, proof.reference)));
  else if (proof.kind === "name")
    supported =
      !!knownName &&
      normalizeIdentityText(proof.reference) ===
        normalizeIdentityText(knownName) &&
      containsIdentityReference(proof.evidence, proof.reference);
  else if (proof.kind === "relationship")
    supported =
      !!knownRelation &&
      normalizeRelationship(proof.reference) === knownRelation &&
      evidenceSupportsRelationship(proof.evidence, knownRelation) &&
      survey.members.filter(
        (item) =>
          normalizeRelationship(String(item.values.relation ?? "")) ===
          knownRelation,
      ).length === 1;
  else
    supported =
      (!!knownName &&
        normalizeIdentityText(proof.reference) ===
          normalizeIdentityText(knownName) &&
        containsIdentityReference(proof.evidence, proof.reference)) ||
      (!!knownRelation &&
        normalizeRelationship(proof.reference) === knownRelation &&
        evidenceSupportsRelationship(proof.evidence, knownRelation) &&
        survey.members.filter(
          (item) =>
            normalizeRelationship(String(item.values.relation ?? "")) ===
            knownRelation,
        ).length === 1);
  if (!supported)
    return "The quoted person reference does not identify this member uniquely. Review the assignment.";
  if (!checkAnswer) return null;
  // A model-provided stable ID cannot overrule an explicit different person in
  // the answer. This catches short multilingual relationship reports as well.
  const namedOthers = survey.members.filter(
    (item) =>
      item.id !== member.id &&
      typeof item.values.name === "string" &&
      containsIdentityReference(proposal.evidence, item.values.name),
  );
  if (namedOthers.length)
    return "This answer names a different family member. Confirm the person before applying it.";
  const relations = mentionedRelationships(proposal.evidence).filter(
    (value) => value !== "self",
  );
  const otherRelations = survey.members.filter(
    (item) =>
      item.id !== member.id &&
      relations.includes(
        normalizeRelationship(String(item.values.relation ?? "")),
      ),
  );
  const effectiveRelation =
    knownRelation ||
    (proof.kind === "introduction"
      ? normalizeRelationship(proposal.relation ?? "")
      : "");
  if (otherRelations.length && !relations.includes(effectiveRelation))
    return "This answer refers to a different relationship in the family. Review the person assignment.";
  return null;
}
