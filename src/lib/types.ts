export type FieldId =
  | "name"
  | "age"
  | "phone"
  | "pregnancyStatus"
  | "pregnancyWeeks"
  | "temperature"
  | "feverDays"
  | "breathingDifficulty"
  | "systolic"
  | "diastolic"
  | "weight"
  | "symptoms"
  | "notes";

export type FieldValue = string | number | boolean | null;
export type Language = "en" | "kn" | "hi";

export interface Member {
  id: string;
  name: string;
  relation: string;
  age: number;
  sex: "female" | "male" | "other";
  phone?: string;
  conditions: string[];
}

export interface Household {
  id: string;
  code: string;
  familyName: string;
  address: string;
  area: string;
  members: Member[];
  lastVisit: string | null;
  nextVisit: string | null;
  status: "due" | "upcoming" | "visited";
  color: string;
}

export interface TranscriptSegment {
  id: string;
  index: number;
  text: string;
  timestamp: string;
  memberId: string;
  language: Language;
  source: "demo" | "manual" | "gnani";
}

export interface PatchChange {
  memberId: string;
  field: FieldId;
  value: FieldValue;
  evidence: string;
  operation: "set" | "append";
}

export interface ExtractionPatch {
  visitId: string;
  segmentId: string;
  segmentIndex: number;
  baseRevision: number;
  changes: PatchChange[];
}

export interface FieldMeta {
  source: "existing" | "manual" | "extracted";
  revision: number;
  segmentIndex: number;
  evidence?: string;
  manuallyProtected: boolean;
}

export interface MemberRecord {
  values: Partial<Record<FieldId, FieldValue>>;
  meta: Partial<Record<FieldId, FieldMeta>>;
}

export interface Conflict {
  id: string;
  memberId: string;
  field: FieldId;
  currentValue: FieldValue;
  proposedValue: FieldValue;
  evidence: string;
  reason: string;
  resolved: boolean;
}

export interface VisitAlert {
  id: string;
  memberId: string;
  kind: "follow-up" | "review";
  message: string;
  evidence: string;
  acknowledged: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  memberId: string;
  field: FieldId;
  previousValue: FieldValue;
  value: FieldValue;
  source: "manual" | "extracted" | "resolution";
  evidence?: string;
}

export interface Visit {
  id: string;
  householdId: string;
  status: "draft" | "completed";
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  revision: number;
  members: Record<string, MemberRecord>;
  transcripts: TranscriptSegment[];
  processedSegmentIds: string[];
  alerts: VisitAlert[];
  conflicts: Conflict[];
  audit: AuditEntry[];
}

export interface ReviewIssue {
  id: string;
  memberId: string;
  field?: FieldId;
  kind: "missing" | "invalid" | "conflict" | "follow-up";
  message: string;
}

export interface Settings {
  workerName: string;
  area: string;
  language: Language;
  textSize: "default" | "large";
  audioAlerts: boolean;
}

export interface FieldDefinition {
  id: FieldId;
  label: string;
  section: "profile" | "health" | "maternal" | "notes";
  type: "text" | "number" | "select" | "textarea";
  unit?: string;
  options?: { value: string; label: string }[];
}
