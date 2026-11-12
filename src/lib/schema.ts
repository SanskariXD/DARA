import { z } from "zod";
import type { FieldDefinition, FieldId, FieldValue } from "./types";

export const FIELD_IDS = [
  "name",
  "age",
  "phone",
  "pregnancyStatus",
  "pregnancyWeeks",
  "temperature",
  "feverDays",
  "breathingDifficulty",
  "systolic",
  "diastolic",
  "weight",
  "symptoms",
  "notes",
] as const;

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { id: "name", label: "Full name", section: "profile", type: "text" },
  {
    id: "age",
    label: "Age",
    section: "profile",
    type: "number",
    unit: "years",
  },
  { id: "phone", label: "Phone number", section: "profile", type: "text" },
  {
    id: "symptoms",
    label: "Reported symptoms",
    section: "health",
    type: "textarea",
  },
  {
    id: "feverDays",
    label: "Fever duration",
    section: "health",
    type: "number",
    unit: "days",
  },
  {
    id: "temperature",
    label: "Temperature",
    section: "health",
    type: "number",
    unit: "°C",
  },
  {
    id: "breathingDifficulty",
    label: "Breathing difficulty",
    section: "health",
    type: "select",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unknown", label: "Not known" },
    ],
  },
  {
    id: "systolic",
    label: "Blood pressure · systolic",
    section: "health",
    type: "number",
    unit: "mmHg",
  },
  {
    id: "diastolic",
    label: "Blood pressure · diastolic",
    section: "health",
    type: "number",
    unit: "mmHg",
  },
  {
    id: "weight",
    label: "Weight",
    section: "health",
    type: "number",
    unit: "kg",
  },
  {
    id: "pregnancyStatus",
    label: "Pregnancy status",
    section: "maternal",
    type: "select",
    options: [
      { value: "no", label: "Not pregnant" },
      { value: "yes", label: "Pregnant" },
      { value: "unknown", label: "Not known" },
      { value: "not-applicable", label: "Not applicable" },
    ],
  },
  {
    id: "pregnancyWeeks",
    label: "Gestational age",
    section: "maternal",
    type: "number",
    unit: "weeks",
  },
  { id: "notes", label: "Visit notes", section: "notes", type: "textarea" },
];

export const fieldIdSchema = z.enum(FIELD_IDS);
export const fieldValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const patchChangeSchema = z
  .object({
    memberId: z.string().min(1).max(120),
    field: fieldIdSchema,
    value: fieldValueSchema,
    evidence: z.string().trim().min(1).max(4000),
    operation: z.enum(["set", "append"]),
  })
  .strict();

export const extractionPatchSchema = z
  .object({
    visitId: z.string().min(1).max(160),
    segmentId: z.string().min(1).max(160),
    segmentIndex: z.number().int().nonnegative(),
    baseRevision: z.number().int().nonnegative(),
    changes: z.array(patchChangeSchema).max(40),
  })
  .strict();

export const transcriptSegmentSchema = z
  .object({
    id: z.string().min(1).max(160),
    index: z.number().int().nonnegative(),
    text: z.string().min(1).max(8000),
    timestamp: z.string().min(1).max(60),
    memberId: z.string().min(1).max(120),
    language: z.enum(["en", "kn", "hi"]),
    source: z.enum(["demo", "manual", "gnani"]),
  })
  .strict();

const numericBounds: Partial<
  Record<FieldId, { min: number; max: number; integer?: boolean }>
> = {
  age: { min: 0, max: 120, integer: true },
  pregnancyWeeks: { min: 1, max: 45, integer: true },
  temperature: { min: 30, max: 45 },
  feverDays: { min: 0, max: 365, integer: true },
  systolic: { min: 40, max: 300, integer: true },
  diastolic: { min: 20, max: 200, integer: true },
  weight: { min: 1, max: 400 },
};

export function isEmptyValue(value: FieldValue | undefined): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Data-entry bounds are plausibility checks, not normal ranges or a clinical protocol. */
export function normalizeFieldValue(
  field: FieldId,
  value: FieldValue,
): FieldValue {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (numericBounds[field] && /^\d+(?:\.\d+)?$/.test(trimmed))
      return Number(trimmed);
    if (field === "phone") return trimmed.replace(/[\s()-]/g, "");
    if (field === "pregnancyStatus" || field === "breathingDifficulty")
      return trimmed.toLowerCase();
    return trimmed;
  }
  if (
    typeof value === "boolean" &&
    (field === "pregnancyStatus" || field === "breathingDifficulty")
  )
    return value ? "yes" : "no";
  return value;
}

/** Returns a user-facing problem; blank optional values are handled by review requirements. */
export function validateFieldValue(
  field: FieldId,
  value: FieldValue | undefined,
): string | null {
  const definition = FIELD_DEFINITIONS.find((item) => item.id === field);
  if (!definition) return "This field is not part of the questionnaire.";
  if (isEmptyValue(value)) return null;
  const normalized = normalizeFieldValue(field, value as FieldValue);
  const bounds = numericBounds[field];
  if (bounds) {
    if (typeof normalized !== "number" || !Number.isFinite(normalized))
      return `${definition.label} must be a number.`;
    if (bounds.integer && !Number.isInteger(normalized))
      return `${definition.label} must be a whole number.`;
    if (normalized < bounds.min || normalized > bounds.max)
      return `Check ${definition.label.toLowerCase()}: enter ${bounds.min}–${bounds.max}${definition.unit ? ` ${definition.unit}` : ""}.`;
    return null;
  }
  if (typeof normalized !== "string")
    return `${definition.label} must be text.`;
  if (field === "phone" && !/^\d{10}$/.test(normalized))
    return "Enter a 10-digit phone number.";
  if (field === "name" && (normalized.length < 2 || normalized.length > 100))
    return "Enter a name between 2 and 100 characters.";
  if (
    definition.options &&
    !definition.options.some((option) => option.value === normalized)
  )
    return `Choose an available ${definition.label.toLowerCase()} option.`;
  if (normalized.length > 4000)
    return `${definition.label} must be 4,000 characters or fewer.`;
  return null;
}
