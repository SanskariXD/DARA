import { describe, expect, it } from "vitest";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  completeSurvey,
  createSurvey,
  editSurveyField,
  getMemberHealthStatus,
  isSurveyFieldVisible,
  migrateDraftSurvey,
  normalizeRelationship,
  RELATIONSHIP_OPTIONS,
  reviewSurvey,
  surveySchema,
  type Survey,
  type SurveyExtractionEnvelope,
  type SurveyExtractionResult,
  type SurveyTranscript,
} from "../src/lib/survey";
const NOW = "2026-11-13T14:00:00.000Z";
const fresh = () =>
  createSurvey(
    { householdId: "home", workspaceGeneration: "generation-one" },
    NOW,
    "v2-survey",
  );
function roster() {
  let s = editSurveyField(fresh(), null, "familySize", 2);
  s = editSurveyField(s, s.members[0].id, "name", "Anjali");
  s = editSurveyField(s, s.members[0].id, "relation", "self");
  s = editSurveyField(s, s.members[1].id, "name", "Ravi");
  return editSurveyField(s, s.members[1].id, "relation", "husband");
}
const segment = (
  index: number,
  text: string,
  language: SurveyTranscript["language"] = "en",
): SurveyTranscript => ({
  id: `seg-${index}`,
  index,
  text,
  language,
  source: "gnani",
  timestamp: NOW,
});
function envelope(
  s: Survey,
  t: SurveyTranscript,
  result: Partial<SurveyExtractionResult>,
): SurveyExtractionEnvelope {
  return {
    surveyId: s.id,
    segmentId: t.id,
    segmentIndex: t.index,
    baseRevision: s.revision,
    result: { familySize: null, members: [], notes: [], ...result },
  };
}
function extract(
  s: Survey,
  index: number,
  text: string,
  result: Partial<SurveyExtractionResult>,
  protectedKeys: string[] = [],
) {
  const t = segment(index, text);
  s = addSurveyTranscript(s, t);
  return applySurveyExtraction(s, envelope(s, t, result), protectedKeys);
}
const proof = (
  index: number,
  reference: string,
  evidence: string,
  kind: "name" | "relationship" | "introduction" | "context" = "name",
) => ({ kind, reference, evidence, segmentId: `seg-${index}` });

describe("v2 questionnaire and relationships", () => {
  it("creates a valid blank v2 snapshot with all dropdown options and no healthy defaults", () => {
    const s = fresh();
    expect(surveySchema.safeParse(s).success).toBe(true);
    expect(s.templateVersion).toBe(2);
    expect(s.workspaceGeneration).toBe("generation-one");
    expect(RELATIONSHIP_OPTIONS.length).toBeGreaterThan(30);
    const one = editSurveyField(s, null, "familySize", 1);
    expect(getMemberHealthStatus(one.members[0])).toBe("not-discussed");
    expect(one.members[0].values.healthStatus).toBeUndefined();
  });
  it("puts weight in Family, simplifies health, and exposes only one household notes field", () => {
    const s = fresh();
    expect(s.fields.find((f) => f.id === "weight")?.section).toBe("family");
    expect(s.fields.some((f) => f.id === "healthHistory")).toBe(true);
    expect(s.fields.some((f) => f.id === "hypertension")).toBe(true);
    expect(
      s.fields.some((f) =>
        ["symptoms", "conditions", "systolic", "diastolic", "notes"].includes(
          f.id,
        ),
      ),
    ).toBe(false);
    expect(
      s.fields.filter((f) => f.section === "notes").map((f) => f.id),
    ).toEqual(["householdNotes"]);
  });
  it("autofills sex from unambiguous multilingual relationships and allows direct editing", () => {
    let s = editSurveyField(fresh(), null, "familySize", 1);
    const id = s.members[0].id;
    s = editSurveyField(s, id, "relation", "ತಂದೆ");
    expect(s.members[0].values.relation).toBe("father");
    expect(s.members[0].values.sex).toBe("male");
    expect(s.members[0].meta.sex.source).toBe("derived");
    s = editSurveyField(s, id, "relation", "माँ");
    expect(s.members[0].values.sex).toBe("female");
    s = editSurveyField(s, id, "sex", "other");
    s = editSurveyField(s, id, "relation", "son");
    expect(s.members[0].values.sex).toBe("other");
    expect(s.members[0].meta.sex.manuallyProtected).toBe(true);
  });
  it("does not infer sex for ambiguous relationship labels and clears an obsolete derived default", () => {
    let s = editSurveyField(fresh(), null, "familySize", 1);
    const id = s.members[0].id;
    for (const relation of ["self", "spouse", "child", "cousin"]) {
      s = editSurveyField(s, id, "relation", relation);
      expect(s.members[0].values.sex ?? null).toBeNull();
    }
    s = editSurveyField(s, id, "relation", "cousin-male");
    expect(s.members[0].values.sex).toBe("male");
    s = editSurveyField(s, id, "relation", "cousin");
    expect(s.members[0].values.sex).toBeNull();
  });
  it("normalizes six-language relationship labels without guessing a cousin gender", () => {
    expect(
      ["ಅಮ್ಮ", "माँ", "తల్లి", "அம்மா", "അമ്മ"].map(normalizeRelationship),
    ).toEqual(Array(5).fill("mother"));
    expect(normalizeRelationship("cousin brother")).toBe("cousin-male");
    expect(normalizeRelationship("cousin")).toBe("cousin");
  });
  it("shows pregnancy only for relevant sex or an explicit pregnancy answer", () => {
    let s = editSurveyField(fresh(), null, "familySize", 1);
    const id = s.members[0].id;
    const field = s.fields.find((f) => f.id === "pregnancyStatus")!;
    expect(isSurveyFieldVisible(field, s.members[0])).toBe(false);
    s = editSurveyField(s, id, "sex", "male");
    expect(isSurveyFieldVisible(field, s.members[0])).toBe(false);
    s = editSurveyField(s, id, "pregnancyStatus", "yes");
    expect(isSurveyFieldVisible(field, s.members[0])).toBe(true);
    expect(reviewSurvey(s).some((i) => i.fieldId === "pregnancyWeeks")).toBe(
      true,
    );
  });
  it("keeps concerns explicit and still shows existing history when status changes", () => {
    let s = editSurveyField(fresh(), null, "familySize", 1);
    const id = s.members[0].id,
      history = s.fields.find((f) => f.id === "healthHistory")!;
    expect(isSurveyFieldVisible(history, s.members[0])).toBe(false);
    s = editSurveyField(s, id, "healthStatus", "concerns");
    expect(isSurveyFieldVisible(history, s.members[0])).toBe(true);
    s = editSurveyField(s, id, "healthHistory", "Reported fever");
    s = editSurveyField(s, id, "healthStatus", "no-concerns");
    expect(getMemberHealthStatus(s.members[0])).toBe("no-concerns");
    expect(isSurveyFieldVisible(history, s.members[0])).toBe(true);
  });
  it("supports a blank pregnancy-focused template without inventing pregnancy", () => {
    const s = createSurvey({ householdId: "home", kind: "pregnancy" });
    expect(s.templateId).toBe("pregnancy-follow-up");
    expect(s.templateVersion).toBe(2);
    expect(s.members).toEqual([]);
  });
});

describe("proof-backed person attribution and corrections", () => {
  it("requires a source-grounded person reference even when a stable ID is supplied", () => {
    const s = roster(),
      id = s.members[0].id;
    const result = extract(s, 0, "She is 26.", {
      members: [{ memberId: id, age: 26, evidence: "She is 26." }],
    });
    expect(result.members[0].values.age).toBeUndefined();
    expect(result.uncertainties.length).toBe(1);
  });
  it("fills a new blank member from an explicit introduction and preserves field-specific history evidence", () => {
    const text = "Two people. Anjali is 26. She has had a fever for a week.";
    let s = extract(fresh(), 0, text, {
      familySize: 2,
      familySizeEvidence: "Two people.",
      members: [
        {
          slot: 1,
          name: "Anjali",
          age: 26,
          healthStatus: "concerns",
          healthHistory: "diagnosis invented by model",
          evidence: "Anjali is 26. She has had a fever for a week.",
          fieldEvidence: { healthHistory: "She has had a fever for a week." },
          attribution: proof(0, "Anjali", "Anjali is 26.", "introduction"),
        },
      ],
    });
    expect(s.members[0].values.name).toBe("Anjali");
    expect(s.members[0].values.healthHistory).toBe(
      "She has had a fever for a week.",
    );
    expect(s.members[0].meta.healthHistory.evidence).toBe(
      "She has had a fever for a week.",
    );
  });
  it("can introduce a relationship-only family section from an unambiguous quote", () => {
    const s = extract(fresh(), 0, "Two people. My father is 65.", {
      familySize: 2,
      familySizeEvidence: "Two people.",
      members: [
        {
          slot: 1,
          relation: "father",
          age: 65,
          evidence: "My father is 65.",
          attribution: proof(0, "father", "My father is 65.", "introduction"),
        },
      ],
    });
    expect(s.members[0].values.relation).toBe("father");
    expect(s.members[0].values.age).toBe(65);
    expect(s.members[0].values.sex).toBe("male");
  });
  it("maps Kannada husband evidence to the husband, not the selected wife", () => {
    let s = roster();
    const wife = s.members[0].id,
      husband = s.members[1].id;
    const text = "ನನ್ನ ಗಂಡನಿಗೆ ಒಂದು ವಾರದಿಂದ ಜ್ವರ ಇದೆ.";
    s = extract(s, 0, text, {
      members: [
        {
          memberId: husband,
          healthHistory: "Fever",
          evidence: text,
          attribution: proof(0, "husband", text, "relationship"),
        },
      ],
    });
    expect(s.members[1].values.healthHistory).toBe(text);
    expect(s.members[0].values.healthHistory).toBeUndefined();
    s = extract(s, 1, text, {
      members: [
        {
          memberId: wife,
          healthHistory: "Fever",
          evidence: text,
          attribution: proof(1, "husband", text, "relationship"),
        },
      ],
    });
    expect(s.members[0].values.healthHistory).toBeUndefined();
    expect(s.uncertainties.length).toBe(1);
  });
  it("rejects a prior-name context proof when current evidence explicitly refers to another relative", () => {
    let s = roster();
    s = addSurveyTranscript(s, segment(0, "Anjali is speaking."));
    const t = segment(1, "Anjali's husband has fever.");
    s = addSurveyTranscript(s, t);
    const result = applySurveyExtraction(
      s,
      envelope(s, t, {
        members: [
          {
            memberId: s.members[0].id,
            healthHistory: "Fever",
            evidence: t.text,
            attribution: proof(0, "Anjali", "Anjali is speaking.", "context"),
          },
        ],
      }),
    );
    expect(result.members[0].values.healthHistory).toBeUndefined();
    expect(result.uncertainties[0].message).toContain("relationship");
  });
  it("requires an explicit correction and matching old value before replacing extracted answers", () => {
    let s = roster();
    const id = s.members[0].id;
    s = extract(s, 0, "Anjali is 26.", {
      members: [
        {
          memberId: id,
          age: 26,
          evidence: "Anjali is 26.",
          attribution: proof(0, "Anjali", "Anjali is 26."),
        },
      ],
    });
    s = extract(s, 1, "Anjali is 28.", {
      members: [
        {
          memberId: id,
          age: 28,
          evidence: "Anjali is 28.",
          attribution: proof(1, "Anjali", "Anjali is 28."),
        },
      ],
    });
    expect(s.members[0].values.age).toBe(26);
    expect(s.conflicts.some((c) => !c.resolved)).toBe(true);
    s = extract(s, 2, "Actually Anjali is 28, not 26.", {
      members: [
        {
          memberId: id,
          age: 28,
          evidence: "Actually Anjali is 28, not 26.",
          attribution: proof(2, "Anjali", "Actually Anjali is 28, not 26."),
          corrections: [
            {
              fieldId: "age",
              previousValue: 26,
              evidence: "Actually Anjali is 28, not 26.",
            },
          ],
        },
      ],
    });
    expect(s.members[0].values.age).toBe(28);
    expect(s.conflicts.filter((c) => !c.resolved)).toHaveLength(0);
  });
  it("protects manual corrections even when the model supplies explicit correction proof", () => {
    let s = roster();
    const id = s.members[0].id;
    s = editSurveyField(s, id, "age", "29");
    s = extract(s, 0, "Actually Anjali is 28, not 29.", {
      members: [
        {
          memberId: id,
          age: 28,
          evidence: "Actually Anjali is 28, not 29.",
          attribution: proof(0, "Anjali", "Actually Anjali is 28, not 29."),
          corrections: [
            {
              fieldId: "age",
              previousValue: 29,
              evidence: "Actually Anjali is 28, not 29.",
            },
          ],
        },
      ],
    });
    expect(s.members[0].values.age).toBe("29");
    expect(s.conflicts[0].proposedValue).toBe(28);
  });
  it("appends new health reports without erasing the earlier exact report", () => {
    let s = roster();
    const id = s.members[0].id;
    for (const [index, text] of [
      "Anjali has a cough.",
      "Anjali also has fever.",
    ].entries())
      s = extract(s, index, text, {
        members: [
          {
            memberId: id,
            healthHistory: "summary",
            evidence: text,
            attribution: proof(index, "Anjali", text),
          },
        ],
      });
    expect(s.members[0].values.healthHistory).toBe(
      "Anjali has a cough.\nAnjali also has fever.",
    );
  });
});

describe("field-level person evidence", () => {
  it("checks each field quote instead of trusting a broad two-person member excerpt", () => {
    const s = roster();
    const text = "Anjali is 26. Ravi has fever.";
    const result = extract(s, 0, text, {
      members: [
        {
          memberId: s.members[0].id,
          age: 26,
          healthHistory: "Fever",
          evidence: text,
          fieldEvidence: {
            age: "Anjali is 26.",
            healthHistory: "Ravi has fever.",
          },
          attribution: proof(0, "Anjali", "Anjali is 26."),
        },
      ],
    });
    expect(result.members[0].values.age).toBe(26);
    expect(result.members[0].values.healthHistory).toBeUndefined();
    expect(result.uncertainties).toHaveLength(1);
  });
});

describe("additional-note person attribution", () => {
  it("keeps an unproved member note unassigned rather than attaching it to the wrong person", () => {
    const s = roster();
    const text = "My husband needs transport.";
    const result = extract(s, 0, text, {
      notes: [{ memberId: s.members[0].id, text, evidence: text }],
    });
    expect(result.notes[0].memberId).toBeNull();
    expect(result.uncertainties).toHaveLength(1);
  });
  it("accepts a member note only when its original quote proves the correct relationship", () => {
    const s = roster();
    const text = "My husband needs transport.";
    const result = extract(s, 0, text, {
      notes: [
        {
          memberId: s.members[1].id,
          text,
          evidence: text,
          attribution: proof(0, "husband", text, "relationship"),
        },
      ],
    });
    expect(result.notes[0].memberId).toBe(s.members[1].id);
    expect(result.uncertainties).toHaveLength(0);
  });
});

describe("fill-only original-transcript reconciliation", () => {
  it("backfills a missed field from an already live-processed original segment", () => {
    let s = roster();
    const t = segment(0, "Anjali weighs 55 kilograms.");
    s = addSurveyTranscript(s, t);
    s = applySurveyExtraction(s, envelope(s, t, {}));
    const result = applySurveyReconciliation(
      s,
      envelope(s, t, {
        members: [
          {
            memberId: s.members[0].id,
            weight: 55,
            evidence: t.text,
            attribution: proof(0, "Anjali", t.text),
          },
        ],
      }),
    );
    expect(result.members[0].values.weight).toBe(55);
    expect(result.members[0].meta.weight.segmentId).toBe(t.id);
  });
  it("never overwrites a newer correction or a manually cleared answer", () => {
    let s = roster();
    const old = segment(0, "Anjali is 26 and weighs 55 kilograms.");
    s = addSurveyTranscript(s, old);
    const request = envelope(s, old, {
      members: [
        {
          memberId: s.members[0].id,
          age: 26,
          weight: 55,
          evidence: old.text,
          attribution: proof(0, "Anjali", old.text),
        },
      ],
    });
    s = editSurveyField(s, s.members[0].id, "age", 28);
    s = editSurveyField(s, s.members[0].id, "weight", "");
    const result = applySurveyReconciliation(s, request);
    expect(result.members[0].values.age).toBe(28);
    expect(result.members[0].values.weight).toBe("");
  });
  it("never overwrites populated extracted answers even if the old result claims a correction", () => {
    let s = roster();
    s = extract(s, 0, "Anjali is 28.", {
      members: [
        {
          memberId: s.members[0].id,
          age: 28,
          evidence: "Anjali is 28.",
          attribution: proof(0, "Anjali", "Anjali is 28."),
        },
      ],
    });
    const t = segment(1, "Actually Anjali is 26, not 28.");
    s = addSurveyTranscript(s, t);
    const result = applySurveyReconciliation(
      s,
      envelope(s, t, {
        members: [
          {
            memberId: s.members[0].id,
            age: 26,
            evidence: t.text,
            attribution: proof(1, "Anjali", t.text),
            corrections: [
              { fieldId: "age", previousValue: 28, evidence: t.text },
            ],
          },
        ],
      }),
    );
    expect(result.members[0].values.age).toBe(28);
  });
  it("cannot change completed surveys or use invented combined-source evidence", () => {
    let s = editSurveyField(fresh(), null, "familySize", 1);
    const id = s.members[0].id;
    s = editSurveyField(s, id, "name", "Anjali");
    s = editSurveyField(s, id, "age", 26);
    const t = segment(0, "Anjali weighs 55 kilograms.");
    s = addSurveyTranscript(s, t);
    const request = envelope(s, t, {
      members: [
        {
          memberId: id,
          weight: 55,
          evidence: "Anjali weighs 55 kilograms. Combined fake quote.",
          attribution: proof(0, "Anjali", t.text),
        },
      ],
    });
    expect(
      applySurveyReconciliation(s, request).members[0].values.weight,
    ).toBeUndefined();
    const done = completeSurvey(s);
    expect(applySurveyReconciliation(done, request)).toBe(done);
  });
});

describe("safe draft migration and historical compatibility", () => {
  it("keeps retained legacy fields out of new extraction writes", () => {
    let s = createSurvey({ householdId: "old", templateVersion: 1 });
    s = editSurveyField(s, null, "familySize", 1);
    const id = s.members[0].id;
    s = editSurveyField(s, id, "name", "Lakshmi");
    s = editSurveyField(s, id, "symptoms", "Original report");
    s = migrateDraftSurvey(s);
    s = extract(s, 0, "Lakshmi has a new report.", {
      members: [
        {
          memberId: id,
          symptoms: "New report",
          evidence: "Lakshmi has a new report.",
          attribution: proof(0, "Lakshmi", "Lakshmi has a new report."),
        },
      ],
    });
    expect(s.members[0].values.symptoms).toBe("Original report");
    expect(s.uncertainties).toHaveLength(1);
  });

  it("keeps completed v1 snapshots byte-for-byte unchanged", () => {
    let s = createSurvey({ householdId: "old", templateVersion: 1 }, NOW, "v1");
    s = editSurveyField(s, null, "familySize", 1);
    s = editSurveyField(s, s.members[0].id, "name", "Lakshmi");
    s = editSurveyField(s, s.members[0].id, "age", 29);
    s = completeSurvey(s);
    const before = JSON.stringify(s);
    expect(migrateDraftSurvey(s)).toBe(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(surveySchema.safeParse(s).success).toBe(true);
  });
  it("migrates draft narratives and named notes without deleting original legacy measurements or claiming health", () => {
    let s = createSurvey(
      { householdId: "old", templateVersion: 1, workspaceGeneration: "g" },
      NOW,
      "v1",
    );
    s = editSurveyField(s, null, "familySize", 1);
    const id = s.members[0].id;
    s = editSurveyField(s, id, "name", "Lakshmi");
    s = editSurveyField(s, id, "age", 29);
    s = editSurveyField(s, id, "symptoms", "Fever since Monday");
    s = editSurveyField(s, id, "conditions", "Reported diabetes");
    s = editSurveyField(s, id, "notes", "Needs transport");
    s = editSurveyField(s, id, "systolic", 120);
    const migrated = migrateDraftSurvey(s);
    expect(migrated.templateVersion).toBe(2);
    expect(migrated.revision).toBe(s.revision + 1);
    expect(migrated.workspaceGeneration).toBe("g");
    expect(migrated.members[0].values.healthHistory).toBe(
      "Fever since Monday\nReported diabetes",
    );
    expect(migrated.members[0].values.symptoms).toBe("Fever since Monday");
    expect(migrated.members[0].values.systolic).toBe(120);
    expect(migrated.household.values.householdNotes).toBe(
      "Lakshmi: Needs transport",
    );
    expect(migrated.fields.find((f) => f.id === "systolic")?.legacy).toBe(true);
    expect(getMemberHealthStatus(migrated.members[0])).toBe("not-discussed");
    expect(surveySchema.safeParse(migrated).success).toBe(true);
    expect(migrateDraftSurvey(migrated)).toBe(migrated);
    expect(
      reviewSurvey(migrated).some((i) => i.id.includes("blood-pressure")),
    ).toBe(false);
  });
  it("retains uncommon historical relationships as selectable values during migration", () => {
    let s = createSurvey({ householdId: "old", templateVersion: 1 });
    s = editSurveyField(s, null, "familySize", 1);
    s = editSurveyField(s, s.members[0].id, "relation", "Great Aunt");
    const result = migrateDraftSurvey(s);
    expect(result.members[0].values.relation).toBe("great aunt");
    expect(
      result.fields
        .find((f) => f.id === "relation")
        ?.options?.some((o) => o.value === "great aunt"),
    ).toBe(true);
    expect(surveySchema.safeParse(result).success).toBe(true);
  });
});

describe("single household notes projection", () => {
  it("puts multiple extracted notes in one field, appends later reports, and deduplicates repeats", () => {
    let s = roster();
    s = extract(s, 0, "We need transport. Please visit on Monday.", {
      notes: [
        { text: "transport", evidence: "We need transport." },
        { text: "visit", evidence: "Please visit on Monday." },
      ],
    });
    expect(s.household.values.householdNotes).toBe(
      "We need transport.\n\nPlease visit on Monday.",
    );
    expect(s.notes).toHaveLength(2);
    s = extract(s, 1, "Bring the old records.", {
      notes: [{ text: "records", evidence: "Bring the old records." }],
    });
    expect(s.household.values.householdNotes).toContain(
      "Bring the old records.",
    );
    s = extract(s, 2, "We need transport.", {
      notes: [{ text: "transport", evidence: "We need transport." }],
    });
    expect(
      String(s.household.values.householdNotes).match(/We need transport\./g),
    ).toHaveLength(1);
  });
  it("keeps manually edited notes and accumulates an explicit proposal without losing any reports", () => {
    let s = editSurveyField(
      roster(),
      null,
      "householdNotes",
      "Worker-entered note",
    );
    s = extract(s, 0, "We need transport.", {
      notes: [{ text: "transport", evidence: "We need transport." }],
    });
    s = extract(s, 1, "Please visit on Monday.", {
      notes: [{ text: "visit", evidence: "Please visit on Monday." }],
    });
    expect(s.household.values.householdNotes).toBe("Worker-entered note");
    const unresolved = s.conflicts.filter((c) => !c.resolved);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].proposedValue).toBe(
      "Worker-entered note\n\nWe need transport.\n\nPlease visit on Monday.",
    );
    expect(s.notes).toHaveLength(2);
  });
  it("does not let old reconciliation append to existing household notes", () => {
    let s = editSurveyField(
      roster(),
      null,
      "householdNotes",
      "Newer worker note",
    );
    const t = segment(0, "We need transport.");
    s = addSurveyTranscript(s, t);
    const result = applySurveyReconciliation(
      s,
      envelope(s, t, { notes: [{ text: "transport", evidence: t.text }] }),
    );
    expect(result.household.values.householdNotes).toBe("Newer worker note");
    expect(result.notes[0].evidence).toBe(t.text);
  });
});

describe("optional visible concern measurements", () => {
  it("restores optional fever, measured temperature and breathing fields without inferred readings", () => {
    let s = roster();
    const id = s.members[0].id;
    for (const key of ["feverDays", "temperature", "breathingDifficulty"]) {
      const field = s.fields.find((f) => f.id === key)!;
      expect(field.required).toBe(false);
      expect(isSurveyFieldVisible(field, s.members[0])).toBe(false);
    }
    s = extract(s, 0, "Anjali has fever for seven days.", {
      members: [
        {
          memberId: id,
          healthStatus: "concerns",
          feverDays: 7,
          evidence: "Anjali has fever for seven days.",
          attribution: proof(0, "Anjali", "Anjali has fever for seven days."),
        },
      ],
    });
    expect(s.members[0].values.temperature).toBeUndefined();
    expect(
      isSurveyFieldVisible(
        s.fields.find((f) => f.id === "temperature")!,
        s.members[0],
      ),
    ).toBe(true);
  });
  it("shows an explicitly extracted temperature even if health status was not discussed and protects its manual correction", () => {
    let s = roster();
    const id = s.members[0].id;
    s = extract(s, 0, "Anjali measured 38.2 degrees Celsius.", {
      members: [
        {
          memberId: id,
          temperature: 38.2,
          evidence: "Anjali measured 38.2 degrees Celsius.",
          attribution: proof(
            0,
            "Anjali",
            "Anjali measured 38.2 degrees Celsius.",
          ),
        },
      ],
    });
    expect(s.members[0].values.temperature).toBe(38.2);
    expect(getMemberHealthStatus(s.members[0])).toBe("not-discussed");
    expect(
      isSurveyFieldVisible(
        s.fields.find((f) => f.id === "temperature")!,
        s.members[0],
      ),
    ).toBe(true);
    s = editSurveyField(s, id, "temperature", "37.5");
    s = extract(s, 1, "Actually Anjali measured 38.5, not 37.5.", {
      members: [
        {
          memberId: id,
          temperature: 38.5,
          evidence: "Actually Anjali measured 38.5, not 37.5.",
          attribution: proof(
            1,
            "Anjali",
            "Actually Anjali measured 38.5, not 37.5.",
          ),
          corrections: [
            {
              fieldId: "temperature",
              previousValue: 37.5,
              evidence: "Actually Anjali measured 38.5, not 37.5.",
            },
          ],
        },
      ],
    });
    expect(s.members[0].values.temperature).toBe("37.5");
    expect(
      s.conflicts.some((c) => c.fieldId === "temperature" && !c.resolved),
    ).toBe(true);
  });
});
