import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  createSurveyRepository,
  SurveyStorageConflict,
  SurveyStorageDataError,
  type SurveyHousehold,
} from "../src/lib/survey-db";
import {
  createSurvey,
  editSurveyField,
  completeSurvey,
  type Survey,
} from "../src/lib/survey";

const instances: Array<ReturnType<typeof createSurveyRepository>> = [];
const databases = new Set<string>();
function open(
  name = `dara-survey-test-${crypto.randomUUID()}`,
  seedExamples = false,
) {
  const repo = createSurveyRepository(name, { seedExamples });
  instances.push(repo);
  databases.add(name);
  return { repo, name };
}
const withoutEpoch = <T extends { workspaceGeneration?: string }>(
  value: T,
): T => {
  const result = { ...value };
  delete result.workspaceGeneration;
  return result;
};
const household = (id = "home-1"): SurveyHousehold => ({
  id,
  label: "Test household",
  code: "",
  address: "",
  createdAt: "2026-11-13T12:00:00Z",
});
function draft(id = "survey-1", householdId = "home-1"): Survey {
  return createSurvey({ householdId }, "2026-11-13T12:00:00Z", id);
}
function completed(id = "survey-1", householdId = "home-1"): Survey {
  let survey = editSurveyField(draft(id, householdId), null, "familySize", 1);
  survey = editSurveyField(survey, survey.members[0].id, "name", "Test Member");
  survey = editSurveyField(survey, survey.members[0].id, "age", "29");
  return completeSurvey(survey);
}
afterEach(async () => {
  instances.splice(0).forEach((repo) => repo.close());
  await Promise.all([...databases].map((name) => Dexie.delete(name)));
  databases.clear();
});

describe("empty device survey workspace", () => {
  it("starts empty on concurrent initialization with no fictional profile or records", async () => {
    const { repo, name } = open();
    const { repo: second } = open(name);
    const [first, other] = await Promise.all([
      repo.loadWorkspace(),
      second.loadWorkspace(),
    ]);
    expect(first.households).toEqual([]);
    expect(first.surveys).toEqual([]);
    expect(first.settings.workerName).toBe("");
    expect(first.settings.area).toBe("");
    expect(other).toEqual(first);
  });
  it("creates an empty household, edits it and reloads without inventing members", async () => {
    const { repo, name } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    await repo.saveHousehold({ ...household(), label: "Changed label" });
    const { repo: reloaded } = open(name);
    const loaded = await reloaded.loadWorkspace();
    expect(loaded.households).toHaveLength(1);
    expect(loaded.households[0].label).toBe("Changed label");
    expect(loaded.households[0]).not.toHaveProperty("members");
    expect(loaded.surveys).toEqual([]);
  });
  it("orders fast draft writes and rejects a late lower revision", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    const initial = draft();
    const revised = {
      ...initial,
      revision: 1,
      household: { values: { familySize: 3 }, meta: {} },
    };
    await Promise.all([repo.saveSurvey(initial), repo.saveSurvey(revised)]);
    await expect(repo.saveSurvey(initial)).rejects.toBeInstanceOf(
      SurveyStorageConflict,
    );
    expect((await repo.loadWorkspace()).surveys[0].revision).toBe(1);
  });
  it("rejects divergent same-revision snapshots and missing households", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await expect(repo.saveSurvey(draft())).rejects.toThrow(
      "Add this household",
    );
    await repo.saveHousehold(household());
    await repo.saveSurvey(draft());
    await expect(
      repo.saveSurvey({ ...draft(), updatedAt: "2026-11-13T12:01:00Z" }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
  });
  it("detects independent tab edits even with a greater domain revision", async () => {
    const { repo, name } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    await repo.saveSurvey(draft());
    const { repo: other } = open(name);
    await other.loadWorkspace();
    await repo.saveSurvey({ ...draft(), revision: 1 });
    await expect(
      other.saveSurvey({ ...draft(), revision: 9 }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    await other.exportWorkspace();
    await expect(
      other.saveSurvey({ ...draft(), revision: 10 }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
  });
  it("allows household deletion only when no survey history exists", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    await repo.deleteHousehold("home-1");
    expect((await repo.loadWorkspace()).households).toEqual([]);
    await repo.saveHousehold(household());
    await repo.saveSurvey(draft());
    await expect(repo.deleteHousehold("home-1")).rejects.toThrow(
      "saved surveys",
    );
    expect((await repo.loadWorkspace()).surveys).toHaveLength(1);
  });
  it("rejects repeat references to drafts and households other than the parent", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    await repo.saveSurvey(draft());
    await expect(
      repo.saveSurvey({ ...draft("repeat"), repeatOf: "survey-1" }),
    ).rejects.toThrow("completed survey");
  });
  it("keeps completed surveys immutable and repeats completely blank", async () => {
    const { repo, name } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    const finished = completed();
    await repo.completeSurvey(finished);
    await repo.completeSurvey(finished);
    await expect(
      repo.saveSurvey({ ...finished, revision: finished.revision + 1 }),
    ).rejects.toThrow("read-only");
    const repeat = createSurvey({
      householdId: "home-1",
      repeatOf: finished.id,
    });
    await repo.saveSurvey(repeat);
    const { repo: reloaded } = open(name);
    const loaded = await reloaded.loadWorkspace();
    expect(
      withoutEpoch(loaded.surveys.find((item) => item.id === finished.id)!),
    ).toEqual(finished);
    expect(
      loaded.surveys.find((item) => item.id === repeat.id)?.household.values,
    ).toEqual({});
    expect(
      loaded.surveys.find((item) => item.id === repeat.id)?.members,
    ).toEqual([]);
    expect(loaded.surveys.find((item) => item.id === repeat.id)?.repeatOf).toBe(
      finished.id,
    );
  });
  it("rejects an invalid completed survey and cross-household repeats", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    await repo.saveHousehold(household("home-2"));
    const finished = completed();
    await repo.completeSurvey(finished);
    const repeat = createSurvey({
      householdId: "home-2",
      repeatOf: finished.id,
    });
    await expect(repo.saveSurvey(repeat)).rejects.toThrow(
      "completed survey in this household",
    );
    expect(() =>
      repo.completeSurvey({
        ...draft("bad"),
        status: "completed",
        completedAt: "2026-11-13T13:00:00Z",
      }),
    ).toThrow("review items");
    expect((await repo.loadWorkspace()).surveys).toHaveLength(1);
  });

  it("preserves the draft if completing it fails to write", async () => {
    const { repo } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    const originalDraft = draft();
    await repo.saveSurvey(originalDraft);
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "surveys")
          throw new DOMException("Storage full", "QuotaExceededError");
        return originalPut.apply(this, args);
      });
    try {
      await expect(repo.completeSurvey(completed())).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(withoutEpoch((await repo.loadWorkspace()).surveys[0])).toEqual(
      originalDraft,
    );
    await repo.completeSurvey(completed());
    expect((await repo.loadWorkspace()).surveys[0].status).toBe("completed");
  });

  it("backs up corrupt records without replacing them", async () => {
    const { repo, name } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    const raw = new Dexie(name);
    await raw.open();
    await raw
      .table("households")
      .put({ id: "home-1", value: { id: "home-1" }, version: 2 });
    raw.close();
    await expect(repo.loadWorkspace()).rejects.toBeInstanceOf(
      SurveyStorageDataError,
    );
    const backup = await repo.exportWorkspace();
    expect("raw" in backup).toBe(true);
    if ("raw" in backup)
      expect(backup.raw.households[0].value).toEqual({ id: "home-1" });
  });
});

describe("example seeding, migration and explicit reset", () => {
  it("seeds exactly two antenatal and three general example households once", async () => {
    const { repo, name } = open(undefined, true);
    const first = await repo.loadWorkspace();
    expect(first.households).toHaveLength(5);
    expect(first.households.every((home) => home.source === "example")).toBe(
      true,
    );
    expect(
      first.surveys.filter(
        (survey) => survey.templateId === "pregnancy-follow-up",
      ),
    ).toHaveLength(2);
    expect(
      first.surveys.filter((survey) => survey.templateId === "family-health"),
    ).toHaveLength(3);
    const { repo: reloaded } = open(name, true);
    expect(await reloaded.loadWorkspace()).toEqual(first);
  });

  it("adds examples during upgrade without overwriting existing records or colliding user IDs", async () => {
    const { repo, name } = open();
    const initial = await repo.loadWorkspace();
    const userHome = household();
    await repo.saveHousehold(userHome);
    await repo.saveSurvey(draft());
    const collidingHome = {
      ...household("dara-example-home-nandini"),
      label: "User-owned record",
    };
    await repo.saveHousehold(collidingHome);
    const { repo: upgraded } = open(name, true);
    const data = await upgraded.loadWorkspace();
    expect(data.generation).toBe(initial.generation);
    expect(data.households).toHaveLength(6);
    expect(
      withoutEpoch(data.households.find((home) => home.id === "home-1")!),
    ).toEqual(userHome);
    expect(
      data.households.find((home) => home.id === collidingHome.id)?.label,
    ).toBe("User-owned record");
    expect(
      data.surveys.find(
        (survey) => survey.id === "dara-example-survey-nandini",
      ),
    ).toBeUndefined();
    expect(
      withoutEpoch(data.surveys.find((survey) => survey.id === "survey-1")!),
    ).toEqual(draft());
    await upgraded.saveHousehold({
      ...data.households.find(
        (home) => home.id === "dara-example-home-ayesha",
      )!,
      label: "Edited example",
    });
    const { repo: again } = open(name, true);
    expect(
      (await again.loadWorkspace()).households.find(
        (home) => home.id === "dara-example-home-ayesha",
      )?.label,
    ).toBe("Edited example");
  });

  it("explicit reset restores canonical examples, removes user records and keeps preferences", async () => {
    const { repo } = open(undefined, true);
    const original = await repo.loadWorkspace();
    const preferences = {
      ...original.settings,
      workerName: "Worker",
      language: "ta" as const,
      textSize: "large" as const,
    };
    await repo.saveSettings(preferences);
    await repo.saveHousehold({
      ...original.households[0],
      label: "Edited example",
    });
    const sampleDraft = original.surveys.find(
      (survey) => survey.status === "draft",
    )!;
    await repo.saveSurvey(
      editSurveyField(
        sampleDraft,
        sampleDraft.members[0].id,
        "name",
        "Edited name",
      ),
    );
    await repo.saveHousehold(household());
    await repo.saveSurvey(draft());
    const restored = await repo.resetUserEntries();
    expect(restored.generation).not.toBe(original.generation);
    expect(restored.settings).toEqual(preferences);
    expect(restored.households.map(withoutEpoch)).toEqual(
      original.households.map(withoutEpoch),
    );
    expect(restored.surveys.map(withoutEpoch)).toEqual(
      original.surveys.map(withoutEpoch),
    );
    expect(restored.households.some((home) => home.id === "home-1")).toBe(
      false,
    );
  });

  it("rejects queued writes and old example callbacks after reset in the same tab or another tab", async () => {
    const { repo, name } = open(undefined, true);
    const original = await repo.loadWorkspace();
    const { repo: other } = open(name, true);
    await other.loadWorkspace();
    const oldHome = original.households[0];
    const oldDraft = original.surveys.find(
      (survey) => survey.status === "draft",
    )!;
    const reset = repo.resetUserEntries();
    const queuedOldWrite = repo.saveHousehold({
      ...oldHome,
      label: "Queued stale edit",
    });
    await reset;
    await expect(queuedOldWrite).rejects.toBeInstanceOf(SurveyStorageConflict);
    await expect(
      repo.saveHousehold({ ...oldHome, label: "Delayed callback" }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    await expect(
      repo.saveSurvey(
        editSurveyField(
          oldDraft,
          oldDraft.members[0].id,
          "name",
          "Delayed name",
        ),
      ),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    await expect(
      other.saveHousehold({ ...oldHome, label: "Other tab" }),
    ).rejects.toBeInstanceOf(SurveyStorageConflict);
    expect((await repo.loadWorkspace()).households[0].label).toBe(
      oldHome.label,
    );
  });

  it("rolls back the entire reset if restoring an example fails", async () => {
    const { repo } = open(undefined, true);
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    const before = await repo.loadWorkspace();
    const originalAdd = IDBObjectStore.prototype.add;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["add"]>
      ) {
        if (this.name === "surveys")
          throw new DOMException("Storage full", "QuotaExceededError");
        return originalAdd.apply(this, args);
      });
    try {
      await expect(repo.resetUserEntries()).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(await repo.loadWorkspace()).toEqual(before);
    expect((await repo.resetUserEntries()).households).toHaveLength(5);
  });

  it("migrates legacy drafts while leaving completed v1 storage unchanged", async () => {
    const { repo, name } = open();
    await repo.loadWorkspace();
    await repo.saveHousehold(household());
    let legacy = createSurvey(
      { householdId: "home-1", templateVersion: 1 },
      "2026-11-13T12:00:00Z",
      "legacy-draft",
    );
    legacy = editSurveyField(legacy, null, "familySize", 1);
    legacy = editSurveyField(
      legacy,
      legacy.members[0].id,
      "name",
      "Legacy Person",
    );
    legacy = editSurveyField(legacy, legacy.members[0].id, "age", 40);
    legacy = editSurveyField(
      legacy,
      legacy.members[0].id,
      "symptoms",
      "Reports an old cough",
    );
    legacy = editSurveyField(
      legacy,
      legacy.members[0].id,
      "notes",
      "Prefers morning visits",
    );
    const completedLegacy = {
      ...completeSurvey(legacy),
      id: "legacy-completed",
    };
    const completedRow = {
      id: completedLegacy.id,
      householdId: "home-1",
      value: completedLegacy,
      version: 7,
    };
    const raw = new Dexie(name);
    await raw.open();
    await raw
      .table("surveys")
      .bulkPut([
        { id: legacy.id, householdId: "home-1", value: legacy, version: 3 },
        completedRow,
      ]);
    raw.close();
    const { repo: upgraded } = open(name, true);
    const data = await upgraded.loadWorkspace();
    const migrated = data.surveys.find((survey) => survey.id === legacy.id)!;
    expect(migrated.templateVersion).toBe(2);
    expect(migrated.members[0].values.symptoms).toBe("Reports an old cough");
    expect(migrated.members[0].values.healthHistory).toBe(
      "Reports an old cough",
    );
    expect(migrated.household.values.householdNotes).toContain(
      "Prefers morning visits",
    );
    const rawAfter = new Dexie(name);
    await rawAfter.open();
    expect(await rawAfter.table("surveys").get(completedLegacy.id)).toEqual(
      completedRow,
    );
    rawAfter.close();
  });
});
