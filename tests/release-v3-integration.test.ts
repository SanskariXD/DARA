import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExampleWorkspace,
  EXAMPLE_HOUSEHOLD_IDS,
  EXAMPLE_SURVEY_IDS,
} from "../src/data/survey-examples";
import {
  createSurveyRepository,
  SurveyStorageConflict,
} from "../src/lib/survey-db";
import {
  addSurveyTranscript,
  applySurveyExtraction,
  applySurveyReconciliation,
  completeSurvey,
  createSurvey,
  editSurveyField,
  surveySchema,
  type Survey,
  type SurveyExtractionEnvelope,
  type SurveyTranscript,
} from "../src/lib/survey";
import {
  reconcileSurveyBatch,
  reconciliationBatches,
} from "../src/lib/survey-reconciliation-client";
import { POST as extractPost } from "../src/app/api/extract/route";
import { unlockWorkspace } from "../src/lib/server/access";

const repositories: ReturnType<typeof createSurveyRepository>[] = [];
const databaseNames = new Set<string>();
const timestamp = "2026-11-13T10:00:00.000Z";
function repository(name = `dara-release-v3-${crypto.randomUUID()}`) {
  const value = createSurveyRepository(name);
  repositories.push(value);
  databaseNames.add(name);
  return { value, name };
}
function withoutGeneration<T extends { workspaceGeneration?: string }>(
  value: T,
) {
  const copy = structuredClone(value);
  delete copy.workspaceGeneration;
  return copy;
}
function transcript(index: number, text: string): SurveyTranscript {
  return {
    id: `qa-passage-${index}`,
    index,
    text,
    timestamp,
    source: "manual",
    language: "en",
  };
}
function namedSurvey(): Survey {
  let survey = createSurvey(
    { householdId: "qa-home", templateVersion: 2 },
    timestamp,
    "qa-survey",
  );
  survey = editSurveyField(survey, null, "familySize", 1, timestamp);
  return editSurveyField(
    survey,
    survey.members[0].id,
    "name",
    "Fixture Person",
    timestamp,
  );
}
function envelope(
  survey: Survey,
  segment: SurveyTranscript,
  member: Record<string, unknown>,
): SurveyExtractionEnvelope {
  return {
    surveyId: survey.id,
    segmentId: segment.id,
    segmentIndex: segment.index,
    baseRevision: survey.revision,
    result: {
      familySize: null,
      members: [
        {
          memberId: survey.members[0].id,
          evidence: segment.text,
          attribution: {
            kind: "name",
            reference: "Fixture Person",
            evidence: segment.text,
            segmentId: segment.id,
          },
          ...member,
        },
      ],
      notes: [],
    },
  } as SurveyExtractionEnvelope;
}
afterEach(async () => {
  repositories.splice(0).forEach((value) => value.close());
  await Promise.all([...databaseNames].map((name) => Dexie.delete(name)));
  databaseNames.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("v0.3 release integration", () => {
  it("hydrates exactly five valid examples concurrently, with two pregnancy visits and three general visits", async () => {
    const first = repository(),
      second = repository(first.name);
    const [one, two] = await Promise.all([
      first.value.loadWorkspace(),
      second.value.loadWorkspace(),
    ]);
    expect(one.households.map((home) => home.id).sort()).toEqual(
      [...EXAMPLE_HOUSEHOLD_IDS].sort(),
    );
    expect(one.surveys.map((survey) => survey.id).sort()).toEqual(
      [...EXAMPLE_SURVEY_IDS].sort(),
    );
    expect(one.households.every((home) => home.source === "example")).toBe(
      true,
    );
    expect(
      one.surveys.filter(
        (survey) => survey.templateId === "pregnancy-follow-up",
      ),
    ).toHaveLength(2);
    expect(
      one.surveys.filter((survey) => survey.templateId === "family-health"),
    ).toHaveLength(2);
    expect(
      one.surveys.filter((survey) => survey.templateId === "rainy-season"),
    ).toHaveLength(1);
    expect(
      one.surveys.every((survey) => surveySchema.safeParse(survey).success),
    ).toBe(true);
    expect(
      one.households.every(
        (home) => home.workspaceGeneration === one.generation,
      ),
    ).toBe(true);
    expect(
      one.surveys.every(
        (survey) => survey.workspaceGeneration === one.generation,
      ),
    ).toBe(true);
    expect(one.settings.workerName).toBe("");
    expect(two).toEqual(one);
  });

  it("reset restores canonical examples and preferences while rejecting delayed old-survey writes from either tab", async () => {
    const first = repository(),
      second = repository(first.name);
    const initial = await first.value.loadWorkspace();
    const ownHome = {
      id: "qa-own-home",
      label: "Own fixture",
      code: "QA-OWN",
      address: "Synthetic address",
      createdAt: timestamp,
      workspaceGeneration: initial.generation,
    };
    await first.value.saveHousehold(ownHome);
    let ownSurvey = createSurvey(
      { householdId: ownHome.id, workspaceGeneration: initial.generation },
      timestamp,
      "qa-own-survey",
    );
    ownSurvey = editSurveyField(ownSurvey, null, "familySize", 1, timestamp);
    await first.value.saveSurvey(ownSurvey);
    const example = initial.surveys.find(
      (survey) => survey.status === "draft",
    )!;
    await first.value.saveSurvey(
      editSurveyField(
        example,
        null,
        "householdNotes",
        "An edit to the fictional example",
        timestamp,
      ),
    );
    const preferences = {
      ...initial.settings,
      workerName: "Fixture Worker",
      area: "Fixture locality",
      language: "ml" as const,
      textSize: "large" as const,
    };
    await first.value.saveSettings(preferences);
    const otherBeforeReset = await second.value.loadWorkspace();
    const staleSurvey = otherBeforeReset.surveys.find(
      (survey) => survey.id === ownSurvey.id,
    )!;

    const reset = await first.value.resetUserEntries();
    const canonical = getExampleWorkspace();
    expect(reset.generation).not.toBe(initial.generation);
    expect(reset.settings).toEqual(preferences);
    expect(
      reset.households
        .map(withoutGeneration)
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(canonical.households.sort((a, b) => a.id.localeCompare(b.id)));
    expect(
      reset.surveys
        .map(withoutGeneration)
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(canonical.surveys.sort((a, b) => a.id.localeCompare(b.id)));
    await expect(
      first.value.saveSurvey(
        editSurveyField(
          ownSurvey,
          null,
          "householdNotes",
          "Late response",
          timestamp,
        ),
      ),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    await expect(
      second.value.saveSurvey(
        editSurveyField(
          staleSurvey,
          null,
          "householdNotes",
          "Late other tab",
          timestamp,
        ),
      ),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    await expect(
      second.value.saveSettings({
        ...preferences,
        workerName: "Stale overwrite",
      }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    const reloaded = await first.value.loadWorkspace();
    expect(reloaded.surveys.some((survey) => survey.id === ownSurvey.id)).toBe(
      false,
    );
    expect(reloaded.settings).toEqual(preferences);
  });

  it("a late full-conversation response fills a missing age without replacing a newer correction or an intentional manual blank", () => {
    const old = transcript(
      0,
      "Fixture Person is 30 years old and weighs 60 kg. The phone is 9876543210.",
    );
    let survey = addSurveyTranscript(namedSurvey(), old, timestamp);
    survey = applySurveyExtraction(
      survey,
      envelope(survey, old, { weight: 60 }),
      [],
      timestamp,
    );
    expect(survey.members[0].values.weight).toBe(60);
    const pendingBackfill = envelope(survey, old, {
      age: 30,
      weight: 60,
      phone: "9876543210",
    });
    const correction = transcript(
      1,
      "Correction: Fixture Person actually weighs 61 kg, not 60 kg.",
    );
    survey = addSurveyTranscript(survey, correction, timestamp);
    survey = applySurveyExtraction(
      survey,
      envelope(survey, correction, {
        weight: 61,
        corrections: [
          { fieldId: "weight", previousValue: 60, evidence: correction.text },
        ],
      }),
      [],
      timestamp,
    );
    survey = editSurveyField(
      survey,
      survey.members[0].id,
      "phone",
      null,
      timestamp,
    );
    const reconciled = applySurveyReconciliation(
      survey,
      pendingBackfill,
      [],
      timestamp,
    );
    expect(reconciled.members[0].values.age).toBe(30);
    expect(reconciled.members[0].values.weight).toBe(61);
    expect(reconciled.members[0].meta.weight.segmentId).toBe(correction.id);
    expect(reconciled.members[0].values.phone).toBeNull();
    expect(reconciled.members[0].meta.phone.manuallyProtected).toBe(true);
    expect(reconciled.conflicts).toHaveLength(0);
    const completed = completeSurvey(reconciled, timestamp);
    expect(
      applySurveyReconciliation(completed, pendingBackfill, [], timestamp),
    ).toBe(completed);
  });

  it("full-conversation batches cover each passage once and process the newest statements first", () => {
    const segments = Array.from({ length: 29 }, (_, index) =>
      transcript(index, `Synthetic passage ${index}.`),
    );
    const batches = reconciliationBatches(segments);
    expect(batches.map((batch) => batch.length)).toEqual([12, 12, 5]);
    expect(
      batches
        .flat()
        .map((segment) => segment.id)
        .sort(),
    ).toEqual(segments.map((segment) => segment.id).sort());
    expect(batches[0][0].index).toBe(17);
    expect(batches[0].at(-1)?.index).toBe(28);
    expect(batches[1].at(-1)!.index).toBeLessThan(batches[0][0].index);
    expect(
      batches.every((batch) =>
        batch.every(
          (segment, index) => !index || segment.index > batch[index - 1].index,
        ),
      ),
    ).toBe(true);
  });

  it("the reconciliation client rejects mismatched checked passages before any field application", async () => {
    const segment = transcript(0, "Fixture Person is 30 years old.");
    const survey = addSurveyTranscript(namedSurvey(), segment, timestamp);
    const original = structuredClone(survey);
    const fetch = vi.fn(async () =>
      Response.json({
        surveyId: survey.id,
        baseRevision: survey.revision,
        checkedSegmentIds: ["different-passage"],
        envelopes: [],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(reconcileSurveyBatch(survey, [segment])).rejects.toThrow(
      "did not match this visit",
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(survey.members[0].values.age).toBeUndefined();
    expect(survey).toEqual(original);
  });

  it("provider wire attribution and multilingual field evidence survive the HTTP boundary and domain application", async () => {
    vi.stubEnv("DARA_ACCESS_CODE", "qa-contract-code");
    vi.stubEnv(
      "DARA_SESSION_SECRET",
      "qa-contract-signing-secret-not-production",
    );
    vi.stubEnv("GEMINI_API_KEY", "qa-provider-placeholder");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const source = transcript(
      0,
      "There are three family members. My name is Fixture Mother. I am 34 years old. I am the mother. I weigh 62.5 kg. ನನಗೆ ತಲೆನೋವು ಇದೆ.",
    );
    source.language = "auto";
    const survey = addSurveyTranscript(
      createSurvey(
        { householdId: "qa-http-home" },
        timestamp,
        "qa-http-survey",
      ),
      source,
      timestamp,
    );
    const wire = {
      familySize: 3,
      familySizeEvidence: "There are three family members.",
      familySizeCorrection: null,
      members: [
        {
          memberId: null,
          slot: 1,
          evidence: source.text,
          uncertain: false,
          attribution: {
            kind: "introduction",
            reference: "Fixture Mother",
            evidence: "My name is Fixture Mother.",
            segmentId: source.id,
          },
          corrections: [],
          fields: [
            {
              fieldId: "name",
              value: "Fixture Mother",
              evidence: "My name is Fixture Mother.",
            },
            { fieldId: "age", value: "34", evidence: "I am 34 years old." },
            {
              fieldId: "relation",
              value: "mother",
              evidence: "I am the mother.",
            },
            { fieldId: "weight", value: "62.5", evidence: "I weigh 62.5 kg." },
            {
              fieldId: "healthStatus",
              value: "concerns",
              evidence: "ನನಗೆ ತಲೆನೋವು ಇದೆ.",
            },
            {
              fieldId: "healthHistory",
              value: "ನನಗೆ ತಲೆನೋವು ಇದೆ.",
              evidence: "ನನಗೆ ತಲೆನೋವು ಇದೆ.",
            },
          ],
        },
      ],
      householdFields: [],
      notes: [],
      uncertainties: [],
    };
    const fetch = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(wire) }] },
            finishReason: "STOP",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const origin = "https://qa.dara.test";
    const cookie = unlockWorkspace(
      new Request(`${origin}/api/auth/session`, {
        headers: { origin, "x-real-ip": "release-integration" },
      }),
      "qa-contract-code",
    ).split(";")[0];
    const response = await extractPost(
      new Request(`${origin}/api/extract`, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({ survey, segment: source }),
      }),
    );
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as SurveyExtractionEnvelope;
    expect(parsed.result.members[0].attribution?.reference).toBe(
      "Fixture Mother",
    );
    expect(parsed.result.members[0].fieldEvidence?.healthHistory).toBe(
      "ನನಗೆ ತಲೆನೋವು ಇದೆ.",
    );
    const applied = applySurveyExtraction(survey, parsed, [], timestamp);
    expect(applied.members).toHaveLength(3);
    expect(applied.members[0].values).toMatchObject({
      name: "Fixture Mother",
      age: 34,
      relation: "mother",
      sex: "female",
      weight: 62.5,
      healthStatus: "concerns",
      healthHistory: "ನನಗೆ ತಲೆನೋವು ಇದೆ.",
    });
    expect(applied.uncertainties).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
