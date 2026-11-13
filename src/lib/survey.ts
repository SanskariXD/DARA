import { z } from 'zod';

export type SurveyValue = string | number | boolean | null;
export type SurveyFieldType = 'text' | 'number' | 'select' | 'textarea';
export interface SurveyFieldDefinition {
  id: string; label: string; scope: 'household' | 'member'; type: SurveyFieldType;
  section: 'household' | 'family' | 'health' | 'notes'; required: boolean;
  unit?: string; options?: { value: string; label: string }[]; custom?: boolean;
  visibleWhen?: { fieldId: string; equals: SurveyValue };
}
export interface SurveyFieldMeta {
  source: 'manual' | 'extracted'; revision: number; segmentIndex: number;
  manuallyProtected: boolean; evidence?: string; segmentId?: string;
}
export interface SurveyAnswerRecord { values: Record<string, SurveyValue>; meta: Record<string, SurveyFieldMeta>; }
export interface SurveyMember extends SurveyAnswerRecord { id: string; }
export interface SurveyTranscript {
  id: string; index: number; text: string; timestamp: string;
  language: 'en' | 'kn' | 'hi'; source: 'gnani' | 'manual';
}
export interface SurveyNote {
  id: string; text: string; evidence: string; memberId: string | null;
  source: 'manual' | 'extracted'; segmentId?: string; reviewed: boolean;
}
export interface SurveyConflict {
  id: string; memberId: string | null; fieldId: string; currentValue: SurveyValue;
  proposedValue: SurveyValue; evidence: string; reason: string; resolved: boolean;
}
export interface SurveyUncertainty {
  id: string; message: string; evidence: string; memberId: string | null;
  resolved: boolean; segmentId?: string;
}
export interface SurveyAuditEntry {
  id: string; timestamp: string; memberId: string | null; fieldId: string;
  previousValue: SurveyValue; value: SurveyValue; source: 'manual' | 'extracted' | 'resolution'; evidence?: string;
}
export interface Survey {
  id: string; householdId: string; templateId: string; templateVersion: number;
  createdAt: string; updatedAt: string; completedAt: string | null;
  status: 'draft' | 'completed'; revision: number; repeatOf?: string;
  fields: SurveyFieldDefinition[]; household: SurveyAnswerRecord; members: SurveyMember[];
  transcripts: SurveyTranscript[]; processedSegmentIds: string[]; notes: SurveyNote[];
  conflicts: SurveyConflict[]; uncertainties: SurveyUncertainty[]; audit: SurveyAuditEntry[];
}
export interface SurveyReviewIssue {
  id: string; memberId: string | null; fieldId?: string;
  kind: 'missing' | 'invalid' | 'conflict' | 'uncertain' | 'count'; message: string;
}

const valueSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
const evidenceSchema = z.string().min(1).max(8000);
export const extractedSurveyFieldSchema = z.object({
  fieldId: z.string().min(1).max(120), value: valueSchema, evidence: evidenceSchema,
}).strict();
export const extractedSurveyMemberSchema = z.object({
  memberId: z.string().max(160).nullable().optional(),
  slot: z.number().int().min(1).max(30).nullable().optional(),
  name: z.string().max(100).nullable().optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  relation: z.string().max(120).nullable().optional(),
  sex: z.enum(['female', 'male', 'other', 'not-stated']).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  symptoms: z.string().max(4000).nullable().optional(),
  conditions: z.string().max(4000).nullable().optional(),
  pregnancyStatus: z.enum(['yes', 'no', 'unknown', 'not-applicable']).nullable().optional(),
  pregnancyWeeks: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(), feverDays: z.number().nullable().optional(),
  breathingDifficulty: z.enum(['yes', 'no', 'unknown']).nullable().optional(),
  systolic: z.number().nullable().optional(), diastolic: z.number().nullable().optional(),
  weight: z.number().nullable().optional(), notes: z.string().max(4000).nullable().optional(),
  evidence: evidenceSchema, uncertain: z.boolean().optional(),
  customFields: z.array(extractedSurveyFieldSchema).max(30).optional(),
}).strict();

/** Sparse field proposals; null means not stated and never clears an answer. */
export const surveyExtractionSchema = z.object({
  familySize: z.number().int().min(1).max(30).nullable(),
  familySizeEvidence: z.string().max(8000).nullable().optional(),
  members: z.array(extractedSurveyMemberSchema).max(30),
  householdFields: z.array(extractedSurveyFieldSchema).max(30).optional(),
  notes: z.array(z.object({
    text: z.string().min(1).max(4000), evidence: evidenceSchema,
    memberId: z.string().max(160).nullable().optional(),
  }).strict()).max(30),
  uncertainties: z.array(z.object({ text: z.string().min(1).max(4000), evidence: evidenceSchema }).strict()).max(30).optional(),
}).strict();
export type SurveyExtractionResult = z.infer<typeof surveyExtractionSchema>;
export interface SurveyExtractionEnvelope {
  surveyId: string; segmentId: string; segmentIndex: number; baseRevision: number;
  result: SurveyExtractionResult;
}

export const surveyFieldSchema = z.object({
  id: z.string().min(1).max(120), label: z.string().trim().min(1).max(100),
  scope: z.enum(['household', 'member']), type: z.enum(['text', 'number', 'select', 'textarea']),
  section: z.enum(['household', 'family', 'health', 'notes']), required: z.boolean(),
  unit: z.string().max(30).optional(),
  options: z.array(z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(100) }).strict()).max(30).optional(),
  custom: z.boolean().optional(),
  visibleWhen: z.object({ fieldId: z.string().min(1).max(120), equals: valueSchema }).strict().optional(),
}).strict();
const metaSchema = z.object({
  source: z.enum(['manual', 'extracted']), revision: z.number().int().nonnegative(),
  segmentIndex: z.number().int().min(-1), manuallyProtected: z.boolean(),
  evidence: z.string().max(8000).optional(), segmentId: z.string().max(160).optional(),
}).strict();
const recordShape = { values: z.record(z.string().max(120), valueSchema), meta: z.record(z.string().max(120), metaSchema) };
export const surveyTranscriptSchema = z.object({
  id: z.string().min(1).max(160), index: z.number().int().nonnegative(), text: z.string().min(1).max(16000),
  timestamp: z.string().datetime(), language: z.enum(['en', 'kn', 'hi']), source: z.enum(['gnani', 'manual']),
}).strict();
export const surveySchema = z.object({
  id: z.string().min(1).max(160), householdId: z.string().min(1).max(160),
  templateId: z.string().min(1).max(100), templateVersion: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
  status: z.enum(['draft', 'completed']), revision: z.number().int().nonnegative(), repeatOf: z.string().max(160).optional(),
  fields: z.array(surveyFieldSchema).max(100), household: z.object(recordShape).strict(),
  members: z.array(z.object({ id: z.string().min(1).max(160), ...recordShape }).strict()).max(30),
  transcripts: z.array(surveyTranscriptSchema).max(2000), processedSegmentIds: z.array(z.string().max(160)).max(2000),
  notes: z.array(z.object({
    id: z.string().min(1).max(300), text: z.string().max(4000), evidence: z.string().max(8000),
    memberId: z.string().max(160).nullable(), source: z.enum(['manual', 'extracted']),
    segmentId: z.string().max(160).optional(), reviewed: z.boolean(),
  }).strict()).max(2000),
  conflicts: z.array(z.object({
    id: z.string().min(1).max(500), memberId: z.string().max(160).nullable(), fieldId: z.string().max(120),
    currentValue: valueSchema, proposedValue: valueSchema, evidence: z.string().max(8000), reason: z.string().max(1000), resolved: z.boolean(),
  }).strict()).max(2000),
  uncertainties: z.array(z.object({
    id: z.string().min(1).max(500), message: z.string().max(4000), evidence: z.string().max(8000), memberId: z.string().max(160).nullable(),
    resolved: z.boolean(), segmentId: z.string().max(160).optional(),
  }).strict()).max(2000),
  audit: z.array(z.object({
    id: z.string().min(1).max(300), timestamp: z.string().datetime(), memberId: z.string().max(160).nullable(),
    fieldId: z.string().max(120), previousValue: valueSchema, value: valueSchema,
    source: z.enum(['manual', 'extracted', 'resolution']), evidence: z.string().max(8000).optional(),
  }).strict()).max(10000),
}).strict().superRefine((survey, ctx) => {
  if (new Set(survey.members.map(member => member.id)).size !== survey.members.length) ctx.addIssue({ code: 'custom', message: 'Member IDs must be unique.' });
  if (new Set(survey.fields.map(field => field.id)).size !== survey.fields.length) ctx.addIssue({ code: 'custom', message: 'Field IDs must be unique.' });
  if (new Set(survey.transcripts.map(segment => segment.id)).size !== survey.transcripts.length) ctx.addIssue({ code: 'custom', message: 'Transcript IDs must be unique.' });
  if (new Set(survey.transcripts.map(segment => segment.index)).size !== survey.transcripts.length) ctx.addIssue({ code: 'custom', message: 'Transcript indices must be unique.' });
  if (new Set(survey.processedSegmentIds).size !== survey.processedSegmentIds.length) ctx.addIssue({ code: 'custom', message: 'Processed segment IDs must be unique.' });
  if ((survey.status === 'completed') !== (survey.completedAt !== null)) ctx.addIssue({ code: 'custom', message: 'Completion status and timestamp disagree.' });
  for (const [id, scope] of [['familySize', 'household'], ['name', 'member'], ['age', 'member']] as const) {
    if (!survey.fields.some(field => field.id === id && field.scope === scope && field.required && !field.visibleWhen)) ctx.addIssue({ code: 'custom', message: `Required template field is missing: ${id}.` });
  }
  for (const [memberId, record] of [[null, survey.household], ...survey.members.map(member => [member.id, member] as const)] as const) {
    for (const key of [...Object.keys(record.values), ...Object.keys(record.meta)]) {
      if (!survey.fields.some(field => field.id === key && field.scope === (memberId ? 'member' : 'household'))) ctx.addIssue({ code: 'custom', message: `Unknown answer field: ${key}.` });
    }
  }
});

export const FAMILY_HEALTH_TEMPLATE: { id: string; version: number; fields: SurveyFieldDefinition[] } = {
  id: 'family-health', version: 1,
  fields: [
    { id: 'familySize', label: 'Family members', scope: 'household', type: 'number', section: 'household', required: true },
    { id: 'householdNotes', label: 'Household notes', scope: 'household', type: 'textarea', section: 'notes', required: false },
    { id: 'name', label: 'Full name', scope: 'member', type: 'text', section: 'family', required: true },
    { id: 'age', label: 'Age', scope: 'member', type: 'number', section: 'family', required: true, unit: 'years' },
    { id: 'relation', label: 'Relationship', scope: 'member', type: 'text', section: 'family', required: false },
    { id: 'sex', label: 'Sex', scope: 'member', type: 'select', section: 'family', required: false, options: [
      { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }, { value: 'not-stated', label: 'Not stated' },
    ] },
    { id: 'phone', label: 'Phone number', scope: 'member', type: 'text', section: 'family', required: false },
    { id: 'symptoms', label: 'Reported symptoms', scope: 'member', type: 'textarea', section: 'health', required: false },
    { id: 'conditions', label: 'Reported health conditions', scope: 'member', type: 'textarea', section: 'health', required: false },
    { id: 'feverDays', label: 'Fever duration', scope: 'member', type: 'number', section: 'health', required: false, unit: 'days' },
    { id: 'temperature', label: 'Temperature', scope: 'member', type: 'number', section: 'health', required: false, unit: '°C' },
    { id: 'breathingDifficulty', label: 'Breathing difficulty reported', scope: 'member', type: 'select', section: 'health', required: false, options: [
      { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Not known' },
    ] },
    { id: 'systolic', label: 'Blood pressure · systolic', scope: 'member', type: 'number', section: 'health', required: false, unit: 'mmHg' },
    { id: 'diastolic', label: 'Blood pressure · diastolic', scope: 'member', type: 'number', section: 'health', required: false, unit: 'mmHg' },
    { id: 'weight', label: 'Weight', scope: 'member', type: 'number', section: 'health', required: false, unit: 'kg' },
    { id: 'pregnancyStatus', label: 'Pregnancy status', scope: 'member', type: 'select', section: 'health', required: false, options: [
      { value: 'yes', label: 'Pregnant' }, { value: 'no', label: 'Not pregnant' }, { value: 'unknown', label: 'Not known' }, { value: 'not-applicable', label: 'Not applicable' },
    ] },
    { id: 'pregnancyWeeks', label: 'Gestational age', scope: 'member', type: 'number', section: 'health', required: true, unit: 'weeks', visibleWhen: { fieldId: 'pregnancyStatus', equals: 'yes' } },
    { id: 'notes', label: 'Member notes', scope: 'member', type: 'textarea', section: 'notes', required: false },
  ],
};

const nowIso = () => new Date().toISOString();
const blankRecord = (): SurveyAnswerRecord => ({ values: {}, meta: {} });
const isBlank = (value: SurveyValue | undefined) => value == null || (typeof value === 'string' && !value.trim());
const cleanComparable = (value: SurveyValue | undefined) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : value;
const getRecord = (survey: Survey, memberId: string | null): SurveyAnswerRecord | undefined => memberId === null ? survey.household : survey.members.find(member => member.id === memberId);
const getField = (survey: Survey, memberId: string | null, fieldId: string) => survey.fields.find(field => field.id === fieldId && field.scope === (memberId === null ? 'household' : 'member'));

export function createSurvey(input: { householdId: string; repeatOf?: string }, now = nowIso(), id = `survey-${crypto.randomUUID()}`): Survey {
  return {
    id, householdId: input.householdId, templateId: FAMILY_HEALTH_TEMPLATE.id, templateVersion: FAMILY_HEALTH_TEMPLATE.version,
    createdAt: now, updatedAt: now, completedAt: null, status: 'draft', revision: 0,
    ...(input.repeatOf ? { repeatOf: input.repeatOf } : {}),
    fields: FAMILY_HEALTH_TEMPLATE.fields.map(field => ({ ...field, ...(field.options ? { options: field.options.map(option => ({ ...option })) } : {}) })),
    household: blankRecord(), members: [], transcripts: [], processedSegmentIds: [], notes: [], conflicts: [], uncertainties: [], audit: [],
  };
}

export function normalizeSurveyValue(field: SurveyFieldDefinition, value: SurveyValue): SurveyValue {
  if (typeof value === 'string') {
    const text = value.trim();
    if (field.type === 'number' && /^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if (field.id === 'phone') return text.replace(/[\s()-]/g, '');
    return text;
  }
  return value;
}

export function validateSurveyValue(field: SurveyFieldDefinition, input: SurveyValue | undefined): string | null {
  if (isBlank(input)) return null;
  const value = normalizeSurveyValue(field, input as SurveyValue);
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${field.label} must be a number.`;
    const bounds: Record<string, [number, number, boolean?]> = {
      familySize: [1, 30, true], age: [0, 120, true], pregnancyWeeks: [1, 45, true],
      feverDays: [0, 365, true], temperature: [30, 45], weight: [1, 400], systolic: [40, 300, true], diastolic: [20, 200, true],
    };
    const range = bounds[field.id];
    if (range && (value < range[0] || value > range[1] || (range[2] && !Number.isInteger(value)))) return `Check ${field.label.toLowerCase()}: enter ${range[2] ? 'a whole number ' : ''}between ${range[0]} and ${range[1]}.`;
    return null;
  }
  if (typeof value !== 'string') return `${field.label} must be text.`;
  if (field.id === 'name' && (value.length < 2 || value.length > 100)) return 'Enter a name between 2 and 100 characters.';
  if (field.id === 'phone' && !/^\d{10}$/.test(value)) return 'Enter a 10-digit phone number.';
  if (field.type === 'select' && !field.options?.some(option => option.value === value)) return `Choose an available ${field.label.toLowerCase()} option.`;
  if (value.length > 4000) return `${field.label} must be 4,000 characters or fewer.`;
  return null;
}

export function isSurveyFieldVisible(field: SurveyFieldDefinition, record: SurveyAnswerRecord): boolean {
  return !field.visibleWhen || cleanComparable(record.values[field.visibleWhen.fieldId]) === cleanComparable(field.visibleWhen.equals);
}
function changeRecord(survey: Survey, memberId: string | null, record: SurveyAnswerRecord): Survey {
  return memberId === null ? { ...survey, household: record }
    : { ...survey, members: survey.members.map(member => member.id === memberId ? { id: member.id, ...record } : member) };
}
function finishMutation(survey: Survey, now: string): Survey { return { ...survey, revision: survey.revision + 1, updatedAt: now }; }
function recordAudit(survey: Survey, memberId: string | null, fieldId: string, previousValue: SurveyValue, value: SurveyValue, source: SurveyAuditEntry['source'], now: string, evidence?: string): Survey {
  return { ...survey, audit: [...survey.audit, { id: `${survey.id}:audit:${survey.revision + 1}:${survey.audit.length}`, timestamp: now, memberId, fieldId, previousValue, value, source, ...(evidence ? { evidence } : {}) }] };
}
export function surveyMemberHasAnswers(member: SurveyMember): boolean { return Object.values(member.values).some(value => !isBlank(value)); }
function memberHasRecordedContent(survey: Survey, member: SurveyMember): boolean {
  return surveyMemberHasAnswers(member) || survey.notes.some(note => note.memberId === member.id)
    || survey.conflicts.some(conflict => conflict.memberId === member.id && !conflict.resolved)
    || survey.uncertainties.some(item => item.memberId === member.id && !item.resolved);
}
function reconcileFamilySize(survey: Survey, count: number): Survey {
  if (count > survey.members.length) {
    const additions = Array.from({ length: count - survey.members.length }, (_, index) => ({ id: `${survey.id}:member:${survey.revision + 1}:${index + survey.members.length + 1}`, ...blankRecord() }));
    return { ...survey, members: [...survey.members, ...additions] };
  }
  if (count < survey.members.length) {
    const retained = survey.members.filter((member, index) => index < count || memberHasRecordedContent(survey, member));
    return { ...survey, members: retained };
  }
  return survey;
}

export function editSurveyField(survey: Survey, memberId: string | null, fieldId: string, value: SurveyValue, now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  const record = getRecord(survey, memberId); const field = getField(survey, memberId, fieldId);
  if (!record || !field || !valueSchema.safeParse(value).success) return survey;
  const previousValue = record.values[fieldId] ?? null;
  if (previousValue === value && record.meta[fieldId]?.manuallyProtected) return survey;
  let next = changeRecord(survey, memberId, {
    values: { ...record.values, [fieldId]: value },
    meta: { ...record.meta, [fieldId]: { source: 'manual', manuallyProtected: true, revision: survey.revision + 1, segmentIndex: record.meta[fieldId]?.segmentIndex ?? -1 } },
  });
  next = { ...next, conflicts: next.conflicts.map(conflict => conflict.memberId === memberId && conflict.fieldId === fieldId && !conflict.resolved ? { ...conflict, resolved: true } : conflict) };
  if (memberId === null && fieldId === 'familySize' && !validateSurveyValue(field, value) && !isBlank(value)) next = reconcileFamilySize(next, Number(normalizeSurveyValue(field, value)));
  return finishMutation(recordAudit(next, memberId, fieldId, previousValue, value, 'manual', now), now);
}

export function addSurveyMember(survey: Survey, now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  if (survey.members.length >= 30) throw new Error('A survey supports up to 30 family members.');
  return editSurveyField(survey, null, 'familySize', survey.members.length + 1, now);
}
export function removeSurveyMember(survey: Survey, memberId: string, confirmAnswered = false, now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  const member = survey.members.find(item => item.id === memberId);
  if (!member) return survey;
  if (memberHasRecordedContent(survey, member) && !confirmAnswered) throw new Error('This member has recorded answers. Confirm removal to remove this section.');
  let next: Survey = { ...survey, members: survey.members.filter(item => item.id !== memberId),
    conflicts: survey.conflicts.map(item => item.memberId === memberId ? { ...item, resolved: true } : item),
    uncertainties: survey.uncertainties.map(item => item.memberId === memberId ? { ...item, resolved: true } : item),
    notes: survey.notes.map(note => note.memberId === memberId ? { ...note, memberId: null, reviewed: false } : note),
  };
  next = recordAudit(next, memberId, 'member', String(member.values.name ?? 'Unnamed member'), null, 'manual', now);
  // Zero is an intentionally incomplete draft after removing the last member.
  return editSurveyField(next, null, 'familySize', next.members.length, now);
}

export function addCustomSurveyField(survey: Survey, input: { label: string; scope: 'household' | 'member'; type: SurveyFieldType; required?: boolean; options?: { value: string; label: string }[]; section?: SurveyFieldDefinition['section'] }, now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  if (survey.fields.length >= 100) throw new Error('This survey already has the maximum number of fields.');
  const field: SurveyFieldDefinition = { id: `custom-${survey.revision + 1}-${survey.fields.length + 1}`, label: input.label.trim(), scope: input.scope, type: input.type, required: input.required ?? false,
    section: input.section ?? (input.scope === 'household' ? 'household' : 'health'), custom: true, ...(input.options ? { options: input.options } : {}) };
  const parsed = surveyFieldSchema.safeParse(field);
  if (!parsed.success || (field.type === 'select' && !field.options?.length)) throw new Error('Give the field a label and valid input options.');
  if (survey.fields.some(existing => existing.scope === field.scope && existing.label.toLocaleLowerCase() === field.label.toLocaleLowerCase())) throw new Error('A field with this label already exists.');
  return finishMutation({ ...survey, fields: [...survey.fields, parsed.data] }, now);
}

export function addSurveyTranscript(survey: Survey, input: SurveyTranscript, now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  const parsed = surveyTranscriptSchema.safeParse(input);
  if (!parsed.success || survey.transcripts.some(item => item.id === input.id || item.index === input.index)) return survey;
  if (survey.transcripts.length >= 2000) throw new Error('This survey has reached its transcript limit. Finish this survey before recording more.');
  return finishMutation({ ...survey, transcripts: [...survey.transcripts, parsed.data] }, now);
}

function addUncertainty(survey: Survey, segment: SurveyTranscript, message: string, evidence: string, memberId: string | null = null): Survey {
  if (survey.uncertainties.some(item => item.segmentId === segment.id && item.message === message && item.evidence === evidence)) return survey;
  const item: SurveyUncertainty = { id: `${survey.id}:uncertain:${segment.index}:${survey.uncertainties.length}`, message, evidence, memberId, resolved: false, segmentId: segment.id };
  return { ...survey, uncertainties: [...survey.uncertainties, item] };
}
function exactEvidence(segment: SurveyTranscript, evidence: string | null | undefined): evidence is string {
  return typeof evidence === 'string' && evidence.trim().length > 0 && segment.text.includes(evidence);
}
function findMemberForProposal(survey: Survey, proposal: z.infer<typeof extractedSurveyMemberSchema>): SurveyMember | undefined {
  if (proposal.memberId) return survey.members.find(member => member.id === proposal.memberId);
  if (proposal.slot != null) return survey.members[proposal.slot - 1];
  if (proposal.name?.trim()) {
    const matches = survey.members.filter(member => cleanComparable(member.values.name) === cleanComparable(proposal.name));
    if (matches.length === 1) return matches[0];
  }
  if (proposal.relation?.trim()) {
    const matches = survey.members.filter(member => cleanComparable(member.values.relation) === cleanComparable(proposal.relation));
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

/** Exact evidence and explicit member references are required; semantic accuracy remains reviewable. */
export function applySurveyExtraction(survey: Survey, envelope: SurveyExtractionEnvelope, protectedKeys: string[] = [], now = nowIso()): Survey {
  if (survey.status !== 'draft' || envelope.surveyId !== survey.id || !Number.isInteger(envelope.baseRevision) || envelope.baseRevision < 0 || envelope.baseRevision > survey.revision
    || survey.processedSegmentIds.includes(envelope.segmentId)) return survey;
  const segment = survey.transcripts.find(item => item.id === envelope.segmentId && item.index === envelope.segmentIndex);
  const parsed = surveyExtractionSchema.safeParse(envelope.result);
  if (!segment || !parsed.success) return survey;
  const result = parsed.data;
  const active = new Set(protectedKeys);
  const touched = new Set<string>();
  let next = survey;

  const propose = (memberId: string | null, fieldId: string, input: SurveyValue, evidence: string) => {
    if (input === null) return;
    if (!exactEvidence(segment, evidence)) {
      next = addUncertainty(next, segment, `A proposed ${fieldId} answer has no matching transcript evidence.`, segment.text.slice(0, 8000), memberId);
      return;
    }
    const record = getRecord(next, memberId); const field = getField(next, memberId, fieldId);
    if (!record || !field) {
      next = addUncertainty(next, segment, 'A proposed answer does not match a field in this survey. Add or select the correct field manually.', evidence, memberId);
      return;
    }
    const key = `${memberId ?? 'household'}.${fieldId}`;
    if (touched.has(key)) {
      next = addUncertainty(next, segment, `More than one answer was proposed for ${field.label.toLowerCase()} in this segment. Review the source.`, evidence, memberId);
      return;
    }
    touched.add(key);
    const meta = record.meta[fieldId];
    if (meta && meta.segmentIndex >= segment.index) return;
    const currentValue = record.values[fieldId] ?? null;
    let value = normalizeSurveyValue(field, input);
    if (['symptoms', 'conditions', 'notes', 'householdNotes'].includes(fieldId)) value = evidence;
    if (!valueSchema.safeParse(value).success) {
      next = addUncertainty(next, segment, `The reported ${field.label.toLowerCase()} is too long for one field. Review the original transcript.`, evidence, memberId);
      return;
    }
    // Preserve the latest source order even if the candidate remains unresolved.
    next = changeRecord(next, memberId, { ...record, meta: { ...record.meta, [fieldId]: {
      source: meta?.source ?? 'extracted', revision: meta?.revision ?? survey.revision,
      manuallyProtected: meta?.manuallyProtected ?? false, segmentIndex: segment.index,
      ...(meta?.evidence ? { evidence: meta.evidence } : {}), ...(meta?.segmentId ? { segmentId: meta.segmentId } : {}),
    } } });
    const problem = validateSurveyValue(field, value);
    const protectedByWorker = meta?.manuallyProtected || active.has(key);
    const equivalent = normalizeSurveyValue(field, currentValue) === value;
    if (problem || (protectedByWorker && !equivalent)) {
      const conflict: SurveyConflict = {
        id: `${survey.id}:conflict:${segment.index}:${next.conflicts.length}`, memberId, fieldId,
        currentValue, proposedValue: value, evidence,
        reason: problem ?? (active.has(key) ? 'This field is being edited. Your entry was kept.' : 'Your manual answer was kept. Review the suggested change.'), resolved: false,
      };
      next = { ...next, conflicts: [...next.conflicts.map(item => item.memberId === memberId && item.fieldId === fieldId && !item.resolved ? { ...item, resolved: true } : item), conflict] };
      return;
    }
    if (protectedByWorker) return;
    const current = getRecord(next, memberId)!;
    next = changeRecord(next, memberId, {
      values: { ...current.values, [fieldId]: value },
      meta: { ...current.meta, [fieldId]: { source: 'extracted', revision: survey.revision + 1, segmentIndex: segment.index, manuallyProtected: false, evidence, segmentId: segment.id } },
    });
    if (!equivalent) next = recordAudit(next, memberId, fieldId, currentValue, value, 'extracted', now, evidence);
    if (memberId === null && fieldId === 'familySize') next = reconcileFamilySize(next, Number(value));
  };

  if (result.familySize !== null) {
    if (exactEvidence(segment, result.familySizeEvidence)) propose(null, 'familySize', result.familySize, result.familySizeEvidence);
    else next = addUncertainty(next, segment, 'The proposed family size needs a matching source quote. Confirm the family count manually.', segment.text.slice(0, 8000));
  }
  for (const field of result.householdFields ?? []) propose(null, field.fieldId, field.value, field.evidence);
  const memberFields = ['name', 'age', 'relation', 'sex', 'phone', 'symptoms', 'conditions', 'pregnancyStatus', 'pregnancyWeeks', 'temperature', 'feverDays', 'breathingDifficulty', 'systolic', 'diastolic', 'weight', 'notes'] as const;
  for (const proposal of result.members) {
    if (!exactEvidence(segment, proposal.evidence)) {
      next = addUncertainty(next, segment, 'A proposed member answer has no matching source quote. Review this transcript.', segment.text.slice(0, 8000));
      continue;
    }
    if (proposal.uncertain) {
      next = addUncertainty(next, segment, 'The person or meaning of this answer is uncertain. Assign the information manually after checking it.', proposal.evidence);
      continue;
    }
    // Slots describe the section order at request time. A manual or earlier
    // extraction count change may have moved them while this request was pending.
    if (!proposal.memberId && proposal.slot != null && (survey.household.meta.familySize?.revision ?? 0) > envelope.baseRevision) {
      next = addUncertainty(next, segment, 'Family sections changed while this answer was being processed. Assign this information to the correct member manually.', proposal.evidence);
      continue;
    }
    const member = findMemberForProposal(next, proposal);
    if (!member) {
      next = addUncertainty(next, segment, 'This information could not be assigned to a family member with confidence. Select the correct member and enter the answer.', proposal.evidence);
      continue;
    }
    if (proposal.memberId && proposal.slot != null && next.members[proposal.slot - 1]?.id !== proposal.memberId) {
      next = addUncertainty(next, segment, 'The proposed member ID and section number disagree. Review the member assignment.', proposal.evidence);
      continue;
    }
    // A section number alone cannot authorize replacing an established identity.
    // Name corrections require the stable member ID; otherwise all facts in the
    // proposal may belong to a different person and must stay unassigned.
    if (!proposal.memberId && proposal.slot != null && !isBlank(proposal.name) && !isBlank(member.values.name)
      && cleanComparable(proposal.name) !== cleanComparable(member.values.name)) {
      next = addUncertainty(next, segment, 'This section already belongs to a different name. Confirm which family member this information describes before entering it.', proposal.evidence, member.id);
      continue;
    }
    for (const fieldId of memberFields) {
      const value = proposal[fieldId];
      if (value !== undefined && value !== null) propose(member.id, fieldId, value, proposal.evidence);
    }
    for (const field of proposal.customFields ?? []) propose(member.id, field.fieldId, field.value, field.evidence);
  }
  for (const note of result.notes) {
    if (!exactEvidence(segment, note.evidence)) {
      next = addUncertainty(next, segment, 'A proposed note has no matching source quote. Review this transcript.', segment.text.slice(0, 8000));
      continue;
    }
    if (note.evidence.length > 4000) {
      next = addUncertainty(next, segment, 'A reported note is too long for one field. Review the original transcript.', note.evidence);
      continue;
    }
    const knownMember = note.memberId ? next.members.some(member => member.id === note.memberId) : true;
    if (!knownMember) next = addUncertainty(next, segment, 'A note refers to an unknown family member. It was kept without an assignment.', note.evidence);
    const memberId = knownMember ? note.memberId ?? null : null;
    if (!next.notes.some(item => item.memberId === memberId && item.evidence === note.evidence)) {
      next = { ...next, notes: [...next.notes, {
        id: `${survey.id}:note:${segment.index}:${next.notes.length}`, text: note.evidence, evidence: note.evidence,
        memberId, source: 'extracted', segmentId: segment.id, reviewed: false,
      }] };
    }
  }
  for (const item of result.uncertainties ?? []) {
    if (exactEvidence(segment, item.evidence)) next = addUncertainty(next, segment, item.text, item.evidence);
  }
  return finishMutation({ ...next, processedSegmentIds: [...next.processedSegmentIds, segment.id] }, now);
}

export function resolveSurveyConflict(survey: Survey, conflictId: string, choice: 'keep' | 'accept', now = nowIso()): Survey {
  if (survey.status !== 'draft') return survey;
  const conflict = survey.conflicts.find(item => item.id === conflictId && !item.resolved);
  if (!conflict) return survey;
  const record = getRecord(survey, conflict.memberId); const field = getField(survey, conflict.memberId, conflict.fieldId);
  if (!record || !field) return survey;
  const value = choice === 'accept' ? conflict.proposedValue : record.values[conflict.fieldId] ?? null;
  if (choice === 'accept') {
    const problem = validateSurveyValue(field, value);
    if (problem) throw new Error(problem);
  }
  let next = editSurveyField(survey, conflict.memberId, conflict.fieldId, value, now);
  // A keep action must resolve a conflict even when its protected value is unchanged.
  if (next === survey) next = finishMutation({ ...survey, conflicts: survey.conflicts.map(item => item.id === conflictId ? { ...item, resolved: true } : item) }, now);
  const audit = next.audit.at(-1);
  if (audit && next.audit.length > survey.audit.length) next = { ...next, audit: [...next.audit.slice(0, -1), { ...audit, source: 'resolution', evidence: conflict.evidence }] };
  return next;
}
export function resolveSurveyUncertainty(survey: Survey, uncertaintyId: string, now = nowIso()): Survey {
  if (survey.status !== 'draft' || !survey.uncertainties.some(item => item.id === uncertaintyId && !item.resolved)) return survey;
  return finishMutation({ ...survey, uncertainties: survey.uncertainties.map(item => item.id === uncertaintyId ? { ...item, resolved: true } : item) }, now);
}
export function reviewSurveyNote(survey: Survey, noteId: string, now = nowIso()): Survey {
  if (survey.status !== 'draft' || !survey.notes.some(item => item.id === noteId && !item.reviewed)) return survey;
  return finishMutation({ ...survey, notes: survey.notes.map(item => item.id === noteId ? { ...item, reviewed: true } : item) }, now);
}

export function reviewSurvey(survey: Survey): SurveyReviewIssue[] {
  const issues: SurveyReviewIssue[] = [];
  const records: [string | null, SurveyAnswerRecord][] = [[null, survey.household], ...survey.members.map(member => [member.id, member] as [string, SurveyAnswerRecord])];
  for (const [memberId, record] of records) {
    for (const field of survey.fields.filter(item => item.scope === (memberId === null ? 'household' : 'member'))) {
      const visible = isSurveyFieldVisible(field, record);
      const value = record.values[field.id];
      if (visible && field.required && isBlank(value)) issues.push({ id: `${memberId ?? 'household'}:${field.id}:required`, memberId, fieldId: field.id, kind: 'missing', message: `${field.label} is required.` });
      const problem = validateSurveyValue(field, value);
      if (problem) issues.push({ id: `${memberId ?? 'household'}:${field.id}:invalid`, memberId, fieldId: field.id, kind: 'invalid', message: problem });
    }
    if (memberId !== null) {
      const pregnancy = cleanComparable(record.values.pregnancyStatus);
      if ((pregnancy === 'no' || pregnancy === 'not-applicable') && !isBlank(record.values.pregnancyWeeks)) issues.push({ id: `${memberId}:pregnancy:contradiction`, memberId, fieldId: 'pregnancyWeeks', kind: 'invalid', message: 'Gestational age conflicts with pregnancy status. Review both answers.' });
      if (pregnancy !== 'yes' && pregnancy !== 'no' && pregnancy !== 'not-applicable' && !isBlank(record.values.pregnancyWeeks)) issues.push({ id: `${memberId}:pregnancy:unconfirmed`, memberId, fieldId: 'pregnancyStatus', kind: 'invalid', message: 'Gestational age was recorded without a confirmed pregnancy status. Review both answers.' });
      const systolic = record.values.systolic; const diastolic = record.values.diastolic;
      if (isBlank(systolic) !== isBlank(diastolic)) issues.push({ id: `${memberId}:blood-pressure:partial`, memberId, fieldId: isBlank(systolic) ? 'systolic' : 'diastolic', kind: 'missing', message: 'Record both blood pressure values, or clear the partial measurement.' });
      if (!isBlank(systolic) && !isBlank(diastolic) && Number(diastolic) >= Number(systolic)) issues.push({ id: `${memberId}:blood-pressure:inverted`, memberId, fieldId: 'diastolic', kind: 'invalid', message: 'Check the blood pressure values: systolic should be higher than diastolic.' });
    }
  }
  const size = Number(survey.household.values.familySize);
  if (survey.members.length !== size || !survey.members.length) issues.push({ id: 'family-count', memberId: null, fieldId: 'familySize', kind: 'count', message: survey.members.length > size
    ? `The family count is ${size}, but ${survey.members.length} member sections remain. Recorded answers were kept. Correct the count or explicitly remove surplus members.`
    : 'Confirm the family count and create the matching member sections.' });
  for (const conflict of survey.conflicts) if (!conflict.resolved) issues.push({ id: conflict.id, memberId: conflict.memberId, fieldId: conflict.fieldId, kind: 'conflict', message: conflict.reason });
  for (const item of survey.uncertainties) if (!item.resolved) issues.push({ id: item.id, memberId: item.memberId, kind: 'uncertain', message: item.message });
  for (const note of survey.notes) if (!note.reviewed) issues.push({ id: note.id, memberId: note.memberId, kind: 'uncertain', message: 'Review the additional information recorded from the conversation.' });
  return issues;
}
export function completeSurvey(survey: Survey, now = nowIso()): Survey {
  if (survey.status === 'completed') return survey;
  const issues = reviewSurvey(survey);
  if (issues.length) throw new Error(`Review ${issues.length} ${issues.length === 1 ? 'item' : 'items'} before completing the survey.`);
  return finishMutation({ ...survey, status: 'completed', completedAt: now }, now);
}

/** Compact, explicit extraction context; no full audit/history is sent to the model. */
export function makeExtractionContext(survey: Survey, segment: SurveyTranscript) {
  return {
    surveyId: survey.id, templateId: survey.templateId, templateVersion: survey.templateVersion, baseRevision: survey.revision,
    segment: { id: segment.id, index: segment.index, text: segment.text, language: segment.language },
    fields: survey.fields.map(({ id, label, scope, type, options, unit, visibleWhen }) => ({ id, label, scope, type, ...(options ? { options } : {}), ...(unit ? { unit } : {}), ...(visibleWhen ? { visibleWhen } : {}) })),
    household: survey.household.values,
    members: survey.members.map((member, index) => ({ memberId: member.id, slot: index + 1, values: member.values })),
    recentTranscript: survey.transcripts.filter(item => item.index < segment.index).slice(-8).map(item => ({ index: item.index, text: item.text })),
  };
}
