import {
  extractionPatchSchema,
  FIELD_DEFINITIONS,
  fieldIdSchema,
  fieldValueSchema,
  isEmptyValue,
  normalizeFieldValue,
  transcriptSegmentSchema,
  validateFieldValue,
} from "./schema";
import type {
  AuditEntry,
  Conflict,
  ExtractionPatch,
  FieldId,
  FieldValue,
  Household,
  MemberRecord,
  ReviewIssue,
  TranscriptSegment,
  Visit,
  VisitAlert,
} from "./types";

const nowIso = () => new Date().toISOString();
const hasMember = (visit: Visit, memberId: string) =>
  Object.hasOwn(visit.members, memberId);
const valueAt = (record: MemberRecord, field: FieldId): FieldValue =>
  record.values[field] ?? null;
const labelFor = (field: FieldId) =>
  FIELD_DEFINITIONS.find((item) => item.id === field)?.label ?? field;

export function createVisit(
  household: Household,
  now = nowIso(),
  id = `visit-${crypto.randomUUID()}`,
): Visit {
  const members: Record<string, MemberRecord> = Object.fromEntries(
    household.members.map((member) => {
      const values: MemberRecord["values"] = {
        name: member.name,
        age: member.age,
      };
      if (member.phone) values.phone = member.phone;
      const meta: MemberRecord["meta"] = {};
      for (const field of Object.keys(values) as FieldId[]) {
        meta[field] = {
          source: "existing",
          revision: 0,
          segmentIndex: -1,
          manuallyProtected: false,
        };
      }
      return [member.id, { values, meta }];
    }),
  );
  return {
    id,
    householdId: household.id,
    status: "draft",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    revision: 0,
    members,
    transcripts: [],
    processedSegmentIds: [],
    alerts: [],
    conflicts: [],
    audit: [],
  };
}

/** Register only finalized, uniquely identified segments; does not infer speaker identity. */
export function addTranscriptSegment(
  visit: Visit,
  input: TranscriptSegment,
  now = nowIso(),
): Visit {
  if (visit.status !== "draft") return visit;
  const parsed = transcriptSegmentSchema.safeParse(input);
  if (!parsed.success || !hasMember(visit, input.memberId)) return visit;
  if (
    visit.transcripts.some(
      (segment) => segment.id === input.id || segment.index === input.index,
    )
  )
    return visit;
  return {
    ...visit,
    transcripts: [...visit.transcripts, parsed.data],
    revision: visit.revision + 1,
    updatedAt: now,
  };
}

function makeAudit(
  visit: Visit,
  memberId: string,
  field: FieldId,
  previousValue: FieldValue,
  value: FieldValue,
  source: AuditEntry["source"],
  now: string,
  evidence?: string,
): AuditEntry {
  return {
    id: `${visit.id}:audit:${visit.revision + 1}:${visit.audit.length}`,
    timestamp: now,
    memberId,
    field,
    previousValue,
    value,
    source,
    ...(evidence ? { evidence } : {}),
  };
}

function replaceMemberField(
  visit: Visit,
  memberId: string,
  field: FieldId,
  value: FieldValue,
  source: "manual" | "extracted",
  segmentIndex: number,
  revision: number,
  manuallyProtected: boolean,
  evidence?: string,
): Visit {
  const current = visit.members[memberId];
  return {
    ...visit,
    members: {
      ...visit.members,
      [memberId]: {
        values: { ...current.values, [field]: value },
        meta: {
          ...current.meta,
          [field]: {
            source,
            segmentIndex,
            revision,
            manuallyProtected,
            ...(evidence ? { evidence } : {}),
          },
        },
      },
    },
  };
}

function conflictFor(
  visit: Visit,
  patch: ExtractionPatch,
  memberId: string,
  field: FieldId,
  proposedValue: FieldValue,
  evidence: string,
  reason: string,
): Conflict {
  return {
    id: `${visit.id}:conflict:${patch.segmentId}:${memberId}:${field}`,
    memberId,
    field,
    currentValue: valueAt(visit.members[memberId], field),
    proposedValue,
    evidence,
    reason,
    resolved: false,
  };
}

function appendConflict(visit: Visit, conflict: Conflict): Visit {
  if (visit.conflicts.some((item) => item.id === conflict.id)) return visit;
  return {
    ...visit,
    conflicts: [
      ...visit.conflicts.map((item) =>
        !item.resolved &&
        item.memberId === conflict.memberId &&
        item.field === conflict.field
          ? { ...item, resolved: true }
          : item,
      ),
      conflict,
    ],
  };
}

/**
 * Demo review reminders, not diagnoses or validated triage rules. A numeric report
 * of ongoing fever or an affirmative breathing-difficulty answer is kept visible
 * for the worker to review. No emergency severity or audio instruction is inferred.
 */
function updateObservation(
  visit: Visit,
  memberId: string,
  field: FieldId,
  value: FieldValue,
  evidence: string,
): Visit {
  if (field !== "feverDays" && field !== "breathingDifficulty") return visit;
  const id = `${visit.id}:observation:${memberId}:${field}`;
  const observed =
    (field === "feverDays" && typeof value === "number" && value > 0) ||
    (field === "breathingDifficulty" && value === "yes");
  if (!observed)
    return {
      ...visit,
      alerts: visit.alerts.filter((alert) => alert.id !== id),
    };
  const message =
    field === "feverDays"
      ? `Reported fever for ${value} ${value === 1 ? "day" : "days"}. Review the recorded observation.`
      : "Breathing difficulty was reported. Review the recorded observation.";
  const existing = visit.alerts.find((alert) => alert.id === id);
  if (existing?.message === message && existing.evidence === evidence)
    return visit;
  const alert: VisitAlert = {
    id,
    memberId,
    kind: "follow-up",
    message,
    evidence,
    acknowledged: false,
  };
  return {
    ...visit,
    alerts: [...visit.alerts.filter((item) => item.id !== id), alert],
  };
}

/**
 * Applies only supported changes grounded in a stored final transcript. Independent
 * older fields may still fill; an older response cannot regress a newer field.
 * Every accepted change retains source evidence and explicit manual ownership.
 */
export function applyPatch(
  visit: Visit,
  input: ExtractionPatch,
  protectedFields: string[] = [],
  now = nowIso(),
): Visit {
  if (visit.status !== "draft") return visit;
  const parsed = extractionPatchSchema.safeParse(input);
  if (!parsed.success) return visit;
  const patch = parsed.data;
  if (
    patch.visitId !== visit.id ||
    patch.baseRevision > visit.revision ||
    visit.processedSegmentIds.includes(patch.segmentId)
  )
    return visit;
  const segment = visit.transcripts.find((item) => item.id === patch.segmentId);
  if (
    !segment ||
    segment.index !== patch.segmentIndex ||
    !hasMember(visit, segment.memberId)
  )
    return visit;
  // A provider must resolve repeated changes in its own output to one final value.
  const keys = patch.changes.map(
    (change) => `${change.memberId}.${change.field}`,
  );
  if (new Set(keys).size !== keys.length) return visit;

  const revision = visit.revision + 1;
  const activeFields = new Set(protectedFields);
  let next = visit;
  for (const change of patch.changes) {
    if (
      !hasMember(next, change.memberId) ||
      change.memberId !== segment.memberId
    )
      continue;
    // Exact source quote is required. Substring matching is a provenance check,
    // not proof that a model's interpretation is medically or semantically right.
    if (!segment.text.includes(change.evidence)) continue;
    const record = next.members[change.memberId];
    const meta = record.meta[change.field];
    if (meta && meta.segmentIndex >= patch.segmentIndex) continue;
    if (
      change.operation === "append" &&
      change.field !== "symptoms" &&
      change.field !== "notes"
    )
      continue;

    let value = normalizeFieldValue(change.field, change.value);
    // Symptom narratives preserve the report exactly rather than generated prose.
    if (change.field === "symptoms" || change.field === "notes")
      value = change.evidence;
    if (change.operation === "append") {
      const previous = valueAt(record, change.field);
      const lines =
        typeof previous === "string" && previous ? previous.split("\n") : [];
      value = lines.includes(String(value))
        ? previous
        : [...lines, value].join("\n");
    }
    const previousValue = valueAt(record, change.field);
    // A newer validly attributed proposal owns its stream position even when
    // its value needs review; a late older answer must not replace it silently.
    next = {
      ...next,
      members: {
        ...next.members,
        [change.memberId]: {
          ...next.members[change.memberId],
          meta: {
            ...next.members[change.memberId].meta,
            [change.field]: {
              source: meta?.source ?? "existing",
              revision: meta?.revision ?? 0,
              manuallyProtected: meta?.manuallyProtected ?? false,
              ...(meta?.evidence ? { evidence: meta.evidence } : {}),
              segmentIndex: patch.segmentIndex,
            },
          },
        },
      },
    };
    const problem = validateFieldValue(change.field, value);
    if (problem) {
      next = appendConflict(
        next,
        conflictFor(
          next,
          patch,
          change.memberId,
          change.field,
          value,
          change.evidence,
          problem,
        ),
      );
      continue;
    }
    // Do not allow extraction to erase a required identity value.
    if (
      (change.field === "name" || change.field === "age") &&
      isEmptyValue(value)
    ) {
      next = appendConflict(
        next,
        conflictFor(
          next,
          patch,
          change.memberId,
          change.field,
          value,
          change.evidence,
          `${labelFor(change.field)} cannot be cleared automatically.`,
        ),
      );
      continue;
    }
    const protectedByWorker =
      meta?.manuallyProtected ||
      activeFields.has(`${change.memberId}.${change.field}`) ||
      (meta?.source === "manual" && meta.revision > patch.baseRevision);
    if (protectedByWorker) {
      if (previousValue !== value) {
        next = appendConflict(
          next,
          conflictFor(
            next,
            patch,
            change.memberId,
            change.field,
            value,
            change.evidence,
            activeFields.has(`${change.memberId}.${change.field}`)
              ? "You are editing this field. Your entry was kept."
              : "Your manual entry was kept. Review the suggested change.",
          ),
        );
      }
      continue;
    }
    // Even an equal value advances ordering, preventing a late older change.
    next = replaceMemberField(
      next,
      change.memberId,
      change.field,
      value,
      "extracted",
      patch.segmentIndex,
      revision,
      false,
      change.evidence,
    );
    if (previousValue !== value) {
      next = {
        ...next,
        audit: [
          ...next.audit,
          makeAudit(
            next,
            change.memberId,
            change.field,
            previousValue,
            value,
            "extracted",
            now,
            change.evidence,
          ),
        ],
      };
    }
    next = updateObservation(
      next,
      change.memberId,
      change.field,
      value,
      change.evidence,
    );
  }
  return {
    ...next,
    revision,
    updatedAt: now,
    processedSegmentIds: [...next.processedSegmentIds, patch.segmentId],
  };
}

/** Manual input is preserved immediately; review exposes invalid intermediate values. */
export function editField(
  visit: Visit,
  memberId: string,
  field: FieldId,
  input: FieldValue,
  now = nowIso(),
): Visit {
  if (
    visit.status !== "draft" ||
    !hasMember(visit, memberId) ||
    !fieldIdSchema.safeParse(field).success ||
    !fieldValueSchema.safeParse(input).success
  )
    return visit;
  // Keep all strings exactly as typed, including intermediate decimals, spaces
  // and formatting. Converting "37.0" to 37 on a keystroke would make "37.05"
  // impossible to enter. Validation normalizes a separate copy.
  const value =
    typeof input === "string" ? input : normalizeFieldValue(field, input);
  const record = visit.members[memberId];
  const previousValue = valueAt(record, field);
  if (previousValue === value && record.meta[field]?.manuallyProtected)
    return visit;
  const revision = visit.revision + 1;
  let next = replaceMemberField(
    visit,
    memberId,
    field,
    value,
    "manual",
    record.meta[field]?.segmentIndex ?? -1,
    revision,
    true,
  );
  // A manual change supersedes any older proposed value for this field.
  next = {
    ...next,
    conflicts: next.conflicts.map((conflict) =>
      !conflict.resolved &&
      conflict.memberId === memberId &&
      conflict.field === field
        ? { ...conflict, resolved: true }
        : conflict,
    ),
  };
  next = updateObservation(
    next,
    memberId,
    field,
    normalizeFieldValue(field, value),
    `Manually entered ${labelFor(field).toLowerCase()}: ${value ?? "not recorded"}`,
  );
  return {
    ...next,
    revision,
    updatedAt: now,
    audit: [
      ...next.audit,
      makeAudit(visit, memberId, field, previousValue, value, "manual", now),
    ],
  };
}

export function resolveConflict(
  visit: Visit,
  conflictId: string,
  choice: "keep" | "accept",
  now = nowIso(),
): Visit {
  if (visit.status !== "draft" || !["keep", "accept"].includes(choice))
    return visit;
  const conflict = visit.conflicts.find(
    (item) => item.id === conflictId && !item.resolved,
  );
  if (!conflict || !hasMember(visit, conflict.memberId)) return visit;
  let next = visit;
  if (choice === "accept") {
    const problem = validateFieldValue(conflict.field, conflict.proposedValue);
    if (
      problem ||
      ((conflict.field === "name" || conflict.field === "age") &&
        isEmptyValue(conflict.proposedValue))
    ) {
      throw new Error(problem ?? `${labelFor(conflict.field)} is required.`);
    }
    const value = normalizeFieldValue(conflict.field, conflict.proposedValue);
    const previousValue = valueAt(
      visit.members[conflict.memberId],
      conflict.field,
    );
    next = replaceMemberField(
      next,
      conflict.memberId,
      conflict.field,
      value,
      "manual",
      visit.members[conflict.memberId].meta[conflict.field]?.segmentIndex ?? -1,
      visit.revision + 1,
      true,
      conflict.evidence,
    );
    next = {
      ...next,
      audit: [
        ...next.audit,
        makeAudit(
          visit,
          conflict.memberId,
          conflict.field,
          previousValue,
          value,
          "resolution",
          now,
          conflict.evidence,
        ),
      ],
    };
    next = updateObservation(
      next,
      conflict.memberId,
      conflict.field,
      value,
      conflict.evidence,
    );
  } else {
    // Choosing to keep a focused field is also a worker decision, even if it
    // was originally prefilled and never typed into. Keep it protected.
    const record = visit.members[conflict.memberId];
    const currentValue = valueAt(record, conflict.field);
    next = replaceMemberField(
      next,
      conflict.memberId,
      conflict.field,
      currentValue,
      "manual",
      record.meta[conflict.field]?.segmentIndex ?? -1,
      visit.revision + 1,
      true,
      record.meta[conflict.field]?.evidence,
    );
    next = {
      ...next,
      audit: [
        ...next.audit,
        makeAudit(
          visit,
          conflict.memberId,
          conflict.field,
          currentValue,
          currentValue,
          "resolution",
          now,
          conflict.evidence,
        ),
      ],
    };
  }
  // Resolve all prior proposals on this field; no forgotten older prompt may win later.
  return {
    ...next,
    revision: visit.revision + 1,
    updatedAt: now,
    conflicts: next.conflicts.map((item) =>
      item.memberId === conflict.memberId &&
      item.field === conflict.field &&
      !item.resolved
        ? { ...item, resolved: true }
        : item,
    ),
  };
}

export function acknowledgeAlert(
  visit: Visit,
  alertId: string,
  now = nowIso(),
): Visit {
  if (
    visit.status !== "draft" ||
    !visit.alerts.some((item) => item.id === alertId && !item.acknowledged)
  )
    return visit;
  return {
    ...visit,
    revision: visit.revision + 1,
    updatedAt: now,
    alerts: visit.alerts.map((alert) =>
      alert.id === alertId ? { ...alert, acknowledged: true } : alert,
    ),
  };
}

export function reviewVisit(visit: Visit): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const memberEntries = Object.entries(visit.members);
  if (!memberEntries.length)
    return [
      {
        id: "missing-member",
        memberId: "",
        kind: "missing",
        message: "Add a household member before completing the visit.",
      },
    ];
  for (const [memberId, record] of memberEntries) {
    for (const field of ["name", "age"] as const) {
      if (isEmptyValue(record.values[field]))
        issues.push({
          id: `${memberId}:${field}:required`,
          memberId,
          field,
          kind: "missing",
          message: `${labelFor(field)} is required.`,
        });
    }
    for (const definition of FIELD_DEFINITIONS) {
      const problem = validateFieldValue(
        definition.id,
        record.values[definition.id],
      );
      if (problem)
        issues.push({
          id: `${memberId}:${definition.id}:invalid`,
          memberId,
          field: definition.id,
          kind: "invalid",
          message: problem,
        });
    }
    const pregnancy = normalizeFieldValue(
      "pregnancyStatus",
      record.values.pregnancyStatus ?? null,
    );
    if (pregnancy === "yes" && isEmptyValue(record.values.pregnancyWeeks)) {
      issues.push({
        id: `${memberId}:pregnancyWeeks:required`,
        memberId,
        field: "pregnancyWeeks",
        kind: "missing",
        message: "Record gestational age for the reported pregnancy.",
      });
    }
    if (
      (pregnancy === "no" || pregnancy === "not-applicable") &&
      !isEmptyValue(record.values.pregnancyWeeks)
    ) {
      issues.push({
        id: `${memberId}:pregnancyWeeks:contradiction`,
        memberId,
        field: "pregnancyWeeks",
        kind: "invalid",
        message:
          "Gestational age conflicts with the selected pregnancy status. Review both fields.",
      });
    }
    const systolic = normalizeFieldValue(
      "systolic",
      record.values.systolic ?? null,
    );
    const diastolic = normalizeFieldValue(
      "diastolic",
      record.values.diastolic ?? null,
    );
    if (
      typeof systolic === "number" &&
      typeof diastolic === "number" &&
      diastolic >= systolic
    ) {
      issues.push({
        id: `${memberId}:blood-pressure:contradiction`,
        memberId,
        field: "diastolic",
        kind: "invalid",
        message:
          "Check the blood pressure values: systolic should be higher than diastolic.",
      });
    }
    if (isEmptyValue(systolic) !== isEmptyValue(diastolic)) {
      issues.push({
        id: `${memberId}:blood-pressure:incomplete`,
        memberId,
        field: isEmptyValue(systolic) ? "systolic" : "diastolic",
        kind: "missing",
        message:
          "Record both blood pressure values, or clear the partial measurement.",
      });
    }
  }
  const [primaryId, primary] = memberEntries[0];
  if (isEmptyValue(primary.values.symptoms)) {
    issues.push({
      id: `${primaryId}:symptoms:required`,
      memberId: primaryId,
      field: "symptoms",
      kind: "missing",
      message:
        "Record reported symptoms for the primary member, or enter “No symptoms reported”.",
    });
  }
  for (const conflict of visit.conflicts) {
    if (!conflict.resolved)
      issues.push({
        id: conflict.id,
        memberId: conflict.memberId,
        field: conflict.field,
        kind: "conflict",
        message: conflict.reason,
      });
  }
  for (const alert of visit.alerts) {
    if (!alert.acknowledged)
      issues.push({
        id: alert.id,
        memberId: alert.memberId,
        kind: "follow-up",
        message: alert.message,
      });
  }
  return issues;
}

export function completeVisit(visit: Visit, now = nowIso()): Visit {
  if (visit.status === "completed") return visit;
  const issues = reviewVisit(visit);
  if (issues.length)
    throw new Error(
      `Review ${issues.length} ${issues.length === 1 ? "item" : "items"} before completing this visit.`,
    );
  return {
    ...visit,
    status: "completed",
    completedAt: now,
    updatedAt: now,
    revision: visit.revision + 1,
  };
}
