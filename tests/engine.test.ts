import { describe, expect, it } from "vitest";
import {
  acknowledgeAlert,
  addTranscriptSegment,
  applyPatch,
  completeVisit,
  createVisit,
  editField,
  resolveConflict,
  reviewVisit,
} from "../src/lib/engine";
import { normalizeFieldValue, validateFieldValue } from "../src/lib/schema";
import type {
  ExtractionPatch,
  Household,
  PatchChange,
  TranscriptSegment,
  Visit,
} from "../src/lib/types";

const DATE = "2026-11-13T03:00:00.000Z";
const household: Household = {
  id: "home-1",
  code: "H-001",
  familyName: "Devi",
  address: "1 Demo Road",
  area: "Demo village",
  status: "due",
  color: "blue",
  lastVisit: null,
  nextVisit: null,
  members: [
    {
      id: "mother",
      name: "Lakshmi Devi",
      age: 26,
      sex: "female",
      relation: "Self",
      conditions: [],
    },
    {
      id: "father",
      name: "Ramesh",
      age: 31,
      sex: "male",
      relation: "Husband",
      conditions: [],
    },
  ],
};
const fresh = () => createVisit(household, DATE, "visit-1");

function segment(
  index: number,
  text: string,
  memberId = "mother",
): TranscriptSegment {
  return {
    id: `segment-${index}`,
    index,
    text,
    memberId,
    timestamp: DATE,
    language: "en",
    source: "demo",
  };
}
function patch(
  visit: Visit,
  source: TranscriptSegment,
  changes: Partial<PatchChange>[] = [],
): ExtractionPatch {
  return {
    visitId: visit.id,
    segmentId: source.id,
    segmentIndex: source.index,
    baseRevision: visit.revision,
    changes: changes.map((change) => ({
      memberId: source.memberId,
      field: "age",
      value: 28,
      evidence: source.text,
      operation: "set",
      ...change,
    })),
  };
}
function withPatch(
  visit: Visit,
  index: number,
  text: string,
  changes: Partial<PatchChange>[],
  memberId = "mother",
) {
  const source = segment(index, text, memberId);
  const current = addTranscriptSegment(visit, source);
  return applyPatch(current, patch(current, source, changes), [], DATE);
}

describe("initial visit and finalized transcripts", () => {
  it("loads identities without inventing clinical data", () => {
    const visit = fresh();
    expect(visit.members.mother.values).toEqual({
      name: "Lakshmi Devi",
      age: 26,
    });
    expect(visit.members.mother.meta.name?.source).toBe("existing");
    expect(visit.alerts).toEqual([]);
    expect(visit.householdId).toBe("home-1");
    expect(reviewVisit(visit).map((issue) => issue.field)).toEqual([
      "symptoms",
    ]);
  });
  it("registers a final transcript once and rejects index collisions and unknown people", () => {
    const visit = fresh();
    const source = segment(0, "I am 28.");
    const next = addTranscriptSegment(visit, source);
    expect(next.transcripts).toHaveLength(1);
    expect(next.revision).toBe(visit.revision + 1);
    expect(addTranscriptSegment(next, source)).toBe(next);
    expect(addTranscriptSegment(next, { ...source, id: "another-id" })).toBe(
      next,
    );
    expect(addTranscriptSegment(next, segment(1, "Hello", "outsider"))).toBe(
      next,
    );
    expect(visit.transcripts).toHaveLength(0);
  });
});

describe("grounded, incremental extraction", () => {
  it("fills several fields with provenance and preserves unchanged member references", () => {
    const visit = fresh();
    const updated = withPatch(visit, 0, "I am 28 and weigh 61.5 kilograms.", [
      { field: "age", value: "28" },
      { field: "weight", value: 61.5 },
    ]);
    expect(updated.members.mother.values.age).toBe(28);
    expect(updated.members.mother.values.weight).toBe(61.5);
    expect(updated.members.mother.meta.age?.evidence).toBe(
      "I am 28 and weigh 61.5 kilograms.",
    );
    expect(updated.members.father).toBe(visit.members.father);
    expect(updated.audit).toHaveLength(2);
    expect(new Set(updated.audit.map((item) => item.id)).size).toBe(2);
    expect(visit.members.mother.values.age).toBe(26);
  });
  it("requires the correct visit, stored segment, matching index, and possible base revision", () => {
    const visit = addTranscriptSegment(fresh(), segment(0, "I am 28."));
    const proposal = patch(visit, visit.transcripts[0], [{}]);
    expect(applyPatch(visit, { ...proposal, visitId: "other" })).toBe(visit);
    expect(applyPatch(visit, { ...proposal, segmentId: "missing" })).toBe(
      visit,
    );
    expect(applyPatch(visit, { ...proposal, segmentIndex: 9 })).toBe(visit);
    expect(applyPatch(visit, { ...proposal, baseRevision: 99 })).toBe(visit);
  });
  it("does not attach a husband report to the patient, or accept invented evidence", () => {
    const current = addTranscriptSegment(
      fresh(),
      segment(0, "My husband has had a fever for one week.", "father"),
    );
    const result = applyPatch(
      current,
      patch(current, current.transcripts[0], [
        { memberId: "mother", field: "symptoms", value: "fever" },
        {
          memberId: "father",
          field: "feverDays",
          value: 7,
          evidence: "invented quote",
        },
      ]),
    );
    expect(result.members.mother.values.symptoms).toBeUndefined();
    expect(result.members.father.values.feverDays).toBeUndefined();
    expect(result.alerts).toHaveLength(0);
  });
  it("preserves the original symptom wording, appends distinct reports, and avoids duplicate lines", () => {
    const quote = "My husband has been having fever since a week.";
    let visit = withPatch(
      fresh(),
      0,
      quote,
      [
        {
          field: "symptoms",
          value: "Patient has malaria",
          operation: "append",
        },
      ],
      "father",
    );
    expect(visit.members.father.values.symptoms).toBe(quote);
    visit = withPatch(
      visit,
      1,
      quote,
      [{ field: "symptoms", value: "different summary", operation: "append" }],
      "father",
    );
    expect(visit.members.father.values.symptoms).toBe(quote);
    visit = withPatch(
      visit,
      2,
      "He is also tired.",
      [{ field: "symptoms", value: "tired", operation: "append" }],
      "father",
    );
    expect(visit.members.father.values.symptoms).toBe(
      `${quote}\nHe is also tired.`,
    );
  });
  it("rejects unknown fields, extra patch properties and duplicate changes", () => {
    const visit = addTranscriptSegment(fresh(), segment(0, "I am 28."));
    const valid = patch(visit, visit.transcripts[0], [{}]);
    expect(
      applyPatch(visit, {
        ...valid,
        changes: [{ ...valid.changes[0], field: "diagnosis" }],
      } as unknown as ExtractionPatch),
    ).toBe(visit);
    expect(
      applyPatch(visit, { ...valid, surprise: true } as ExtractionPatch),
    ).toBe(visit);
    expect(
      applyPatch(visit, {
        ...valid,
        changes: [valid.changes[0], valid.changes[0]],
      }),
    ).toBe(visit);
  });
  it("rejects append for numeric fields and identity clearing", () => {
    let visit = withPatch(fresh(), 0, "Age 28.", [
      { field: "age", value: 28, operation: "append" },
    ]);
    expect(visit.members.mother.values.age).toBe(26);
    visit = withPatch(visit, 1, "I do not know my name.", [
      { field: "name", value: null },
    ]);
    expect(visit.members.mother.values.name).toBe("Lakshmi Devi");
    expect(visit.conflicts).toHaveLength(1);
  });
  it("deduplicates a re-delivered segment including its audit and alerts", () => {
    const source = segment(0, "Fever for seven days.", "father");
    const visit = addTranscriptSegment(fresh(), source);
    const proposal = patch(visit, source, [{ field: "feverDays", value: 7 }]);
    const once = applyPatch(visit, proposal);
    expect(applyPatch(once, proposal)).toBe(once);
    expect(once.audit).toHaveLength(1);
    expect(once.alerts).toHaveLength(1);
  });
});

describe("ordering and manual ownership", () => {
  it("lets a newer correction win when responses finish out of order", () => {
    let visit = addTranscriptSegment(fresh(), segment(0, "I am 27."));
    visit = addTranscriptSegment(visit, segment(1, "Actually, I am 28."));
    const earlier = patch(visit, visit.transcripts[0], [{ value: 27 }]);
    const later = patch(visit, visit.transcripts[1], [{ value: 28 }]);
    const corrected = applyPatch(visit, later);
    const result = applyPatch(corrected, earlier);
    expect(result.members.mother.values.age).toBe(28);
    expect(result.audit).toHaveLength(1);
  });
  it("allows unrelated older information while preserving newer fields", () => {
    let visit = addTranscriptSegment(
      fresh(),
      segment(0, "Age 27, phone 9999912345."),
    );
    visit = addTranscriptSegment(visit, segment(1, "Actually, age 28."));
    const older = patch(visit, visit.transcripts[0], [
      { value: 27 },
      { field: "phone", value: "9999912345" },
    ]);
    const newer = patch(visit, visit.transcripts[1], [{ value: 28 }]);
    const result = applyPatch(applyPatch(visit, newer), older);
    expect(result.members.mother.values.age).toBe(28);
    expect(result.members.mother.values.phone).toBe("9999912345");
  });
  it("advances stream ordering even for equal values", () => {
    let visit = addTranscriptSegment(fresh(), segment(0, "Age 27."));
    visit = addTranscriptSegment(visit, segment(1, "Age 26."));
    const older = patch(visit, visit.transcripts[0], [{ value: 27 }]);
    const newer = patch(visit, visit.transcripts[1], [{ value: 26 }]);
    expect(
      applyPatch(applyPatch(visit, newer), older).members.mother.values.age,
    ).toBe(26);
  });
  it("preserves manual edits made while an extraction was in flight", () => {
    const visit = addTranscriptSegment(fresh(), segment(0, "I am 28."));
    const pending = patch(visit, visit.transcripts[0], [{}]);
    const edited = editField(visit, "mother", "age", 29);
    const result = applyPatch(edited, pending);
    expect(result.members.mother.values.age).toBe(29);
    expect(result.conflicts[0].proposedValue).toBe(28);
    expect(result.members.mother.meta.age?.manuallyProtected).toBe(true);
    expect(applyPatch(result, pending)).toBe(result);
  });
  it("protects focused fields even before a manual edit is committed", () => {
    const visit = addTranscriptSegment(
      fresh(),
      segment(0, "My name is Lakshmi Kumar."),
    );
    const result = applyPatch(
      visit,
      patch(visit, visit.transcripts[0], [
        { field: "name", value: "Lakshmi Kumar" },
      ]),
      ["mother.name"],
    );
    expect(result.members.mother.values.name).toBe("Lakshmi Devi");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toContain("editing");
  });
  it("keeping a focused field creates a protected worker decision", () => {
    const visit = addTranscriptSegment(fresh(), segment(0, "Age 28."));
    const conflict = applyPatch(
      visit,
      patch(visit, visit.transcripts[0], [{}]),
      ["mother.age"],
    );
    const kept = resolveConflict(conflict, conflict.conflicts[0].id, "keep");
    expect(kept.members.mother.meta.age?.manuallyProtected).toBe(true);
    const later = withPatch(kept, 1, "Age 29.", [{ value: 29 }]);
    expect(later.members.mother.values.age).toBe(26);
    expect(later.conflicts.filter((item) => !item.resolved)).toHaveLength(1);
  });
  it("supersedes an older unresolved proposal when a newer correction arrives", () => {
    let visit = editField(fresh(), "mother", "age", 30);
    visit = withPatch(visit, 0, "Age 28.", [{ value: 28 }]);
    const oldId = visit.conflicts[0].id;
    visit = withPatch(visit, 1, "Actually, age 29.", [{ value: 29 }]);
    expect(
      visit.conflicts
        .filter((item) => !item.resolved)
        .map((item) => item.proposedValue),
    ).toEqual([29]);
    expect(resolveConflict(visit, oldId, "accept")).toBe(visit);
  });
  it("does not create a conflict when a protected value already agrees", () => {
    let visit = editField(fresh(), "mother", "age", 28);
    visit = withPatch(visit, 0, "I am 28.", [{ value: 28 }]);
    expect(visit.conflicts).toHaveLength(0);
    expect(visit.members.mother.meta.age?.source).toBe("manual");
  });
  it("makes accepting a proposal an explicit protected worker decision", () => {
    let visit = editField(fresh(), "mother", "age", 29);
    visit = withPatch(visit, 0, "I am 28.", [{}]);
    const result = resolveConflict(visit, visit.conflicts[0].id, "accept");
    expect(result.members.mother.values.age).toBe(28);
    expect(result.conflicts[0].resolved).toBe(true);
    expect(result.audit.at(-1)?.source).toBe("resolution");
    expect(result.members.mother.meta.age?.manuallyProtected).toBe(true);
  });
  it("can retain a manual value and manual follow-up edits supersede old proposals", () => {
    let visit = editField(fresh(), "mother", "age", 29);
    visit = withPatch(visit, 0, "I am 28.", [{}]);
    const kept = resolveConflict(visit, visit.conflicts[0].id, "keep");
    expect(kept.members.mother.values.age).toBe(29);
    expect(kept.conflicts[0].resolved).toBe(true);
    const manual = editField(visit, "mother", "age", 30);
    expect(manual.conflicts.every((conflict) => conflict.resolved)).toBe(true);
  });
});

describe("validation and review", () => {
  it("keeps invalid extraction outside values and asks for review", () => {
    let visit = withPatch(fresh(), 1, "Age 260.", [{ value: 260 }]);
    expect(visit.members.mother.values.age).toBe(26);
    expect(visit.conflicts).toHaveLength(1);
    expect(() =>
      resolveConflict(visit, visit.conflicts[0].id, "accept"),
    ).toThrow();
    expect(reviewVisit(visit).some((issue) => issue.kind === "conflict")).toBe(
      true,
    );
    // The invalid newer report still prevents an older response silently winning.
    visit = withPatch(visit, 0, "Age 27.", [{ value: 27 }]);
    expect(visit.members.mother.values.age).toBe(26);
  });
  it("preserves spaces and formatting during manual typing", () => {
    const visit = editField(fresh(), "mother", "name", "Lakshmi ");
    expect(visit.members.mother.values.name).toBe("Lakshmi ");
    const phone = editField(visit, "mother", "phone", "99999 12345");
    expect(phone.members.mother.values.phone).toBe("99999 12345");
    expect(reviewVisit(phone).some((issue) => issue.field === "phone")).toBe(
      false,
    );
  });
  it("preserves intermediate decimals so manual numeric input remains editable", () => {
    let visit = fresh();
    for (const value of ["3", "37", "37.", "37.0", "37.05"]) {
      visit = editField(visit, "mother", "temperature", value);
      expect(visit.members.mother.values.temperature).toBe(value);
    }
    expect(
      reviewVisit(visit).some((issue) => issue.field === "temperature"),
    ).toBe(false);
    visit = editField(visit, "mother", "weight", "58.0");
    expect(visit.members.mother.values.weight).toBe("58.0");
    visit = editField(visit, "mother", "weight", "58.01");
    expect(visit.members.mother.values.weight).toBe("58.01");
  });
  it("uses a normalized copy for observations while keeping manually typed numbers", () => {
    const visit = editField(fresh(), "father", "feverDays", "7");
    expect(visit.members.father.values.feverDays).toBe("7");
    expect(visit.alerts).toHaveLength(1);
    expect(visit.alerts[0].message).toContain("7 days");
    expect(visit.alerts[0].memberId).toBe("father");
    expect(visit.alerts[0].evidence).toContain("7");
  });
  it("preserves an incomplete manual phone and surfaces the error", () => {
    const visit = editField(fresh(), "mother", "phone", "99999");
    expect(visit.members.mother.values.phone).toBe("99999");
    expect(
      reviewVisit(visit).some(
        (issue) => issue.field === "phone" && issue.kind === "invalid",
      ),
    ).toBe(true);
  });
  it("normalizes numeric strings, booleans and formatted phones without treating zero as missing", () => {
    expect(normalizeFieldValue("age", "26")).toBe(26);
    expect(normalizeFieldValue("phone", "09999 12345")).toBe("0999912345");
    expect(normalizeFieldValue("pregnancyStatus", true)).toBe("yes");
    expect(validateFieldValue("age", 0)).toBeNull();
    expect(validateFieldValue("age", 26.5)).toContain("whole");
    expect(validateFieldValue("age", "twenty six")).toContain("number");
    expect(validateFieldValue("pregnancyStatus", "maybe")).toContain(
      "available",
    );
    expect(validateFieldValue("phone", "999991234")).toContain("10-digit");
  });
  it("requires gestational age for reported pregnancy and catches contradictions", () => {
    let visit = editField(fresh(), "mother", "pregnancyStatus", "yes");
    expect(
      reviewVisit(visit).some(
        (issue) => issue.field === "pregnancyWeeks" && issue.kind === "missing",
      ),
    ).toBe(true);
    visit = editField(visit, "mother", "pregnancyWeeks", 20);
    expect(
      reviewVisit(visit).some((issue) => issue.field === "pregnancyWeeks"),
    ).toBe(false);
    visit = editField(visit, "mother", "pregnancyStatus", "no");
    expect(
      reviewVisit(visit).some((issue) => issue.id.includes("contradiction")),
    ).toBe(true);
  });
  it("checks incomplete and inverted blood pressure without diagnosing", () => {
    let visit = editField(fresh(), "mother", "systolic", 80);
    expect(
      reviewVisit(visit).some((issue) => issue.id.includes("incomplete")),
    ).toBe(true);
    visit = editField(visit, "mother", "diastolic", 120);
    expect(
      reviewVisit(visit).some((issue) =>
        issue.id.includes("blood-pressure:contradiction"),
      ),
    ).toBe(true);
  });
  it("requires symptoms only for the primary member and identities for all members", () => {
    let visit = editField(
      fresh(),
      "mother",
      "symptoms",
      "No symptoms reported",
    );
    expect(reviewVisit(visit)).toEqual([]);
    visit = editField(visit, "father", "name", "");
    expect(reviewVisit(visit)).toEqual([
      expect.objectContaining({
        memberId: "father",
        field: "name",
        kind: "missing",
      }),
    ]);
  });
  it("rejects completing a household with no members", () => {
    const visit = createVisit({ ...household, members: [] }, DATE, "empty");
    expect(() => completeVisit(visit)).toThrow("Review 1 item");
  });
});

describe("observations and completion", () => {
  it("retains member-specific source evidence and deduplicates corrected follow-up observations", () => {
    let visit = withPatch(
      fresh(),
      0,
      "My husband has fever for 7 days.",
      [{ field: "feverDays", value: 7 }],
      "father",
    );
    expect(visit.alerts[0].memberId).toBe("father");
    expect(visit.alerts[0].evidence).toBe("My husband has fever for 7 days.");
    expect(visit.alerts[0].message).not.toMatch(/emergency|diagnosis|malaria/i);
    visit = acknowledgeAlert(visit, visit.alerts[0].id);
    expect(visit.alerts[0].acknowledged).toBe(true);
    visit = withPatch(
      visit,
      1,
      "Actually, it has been 8 days.",
      [{ field: "feverDays", value: 8 }],
      "father",
    );
    expect(visit.alerts).toHaveLength(1);
    expect(visit.alerts[0].message).toContain("8 days");
    expect(visit.alerts[0].acknowledged).toBe(false);
  });
  it("clears an observation if a corrected structured value no longer reports it", () => {
    let visit = withPatch(fresh(), 0, "There is breathing difficulty.", [
      { field: "breathingDifficulty", value: "yes" },
    ]);
    expect(visit.alerts).toHaveLength(1);
    visit = withPatch(visit, 1, "No, there is no breathing difficulty.", [
      { field: "breathingDifficulty", value: "no" },
    ]);
    expect(visit.alerts).toEqual([]);
  });
  it("requires acknowledgement and produces an immutable completed record", () => {
    let visit = editField(
      fresh(),
      "mother",
      "symptoms",
      "No symptoms reported",
    );
    visit = withPatch(
      visit,
      0,
      "Fever for 7 days.",
      [{ field: "feverDays", value: 7 }],
      "father",
    );
    expect(() => completeVisit(visit)).toThrow("Review 1 item");
    visit = acknowledgeAlert(visit, visit.alerts[0].id);
    const completed = completeVisit(visit, DATE);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe(DATE);
    expect(completeVisit(completed)).toBe(completed);
    expect(editField(completed, "mother", "age", 99)).toBe(completed);
    expect(addTranscriptSegment(completed, segment(2, "Age 99."))).toBe(
      completed,
    );
    expect(
      applyPatch(
        completed,
        patch(completed, segment(2, "Age 99."), [{ value: 99 }]),
      ),
    ).toBe(completed);
    expect(acknowledgeAlert(completed, completed.alerts[0].id)).toBe(completed);
    expect(resolveConflict(completed, "anything", "accept")).toBe(completed);
  });
  it("does not mutate a frozen input tree", () => {
    const visit = fresh();
    Object.freeze(visit.members.mother.values);
    Object.freeze(visit.members.mother.meta);
    Object.freeze(visit.members.mother);
    Object.freeze(visit.members);
    Object.freeze(visit);
    expect(() => editField(visit, "mother", "age", 28)).not.toThrow();
  });
});
