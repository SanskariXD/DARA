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
function open(name = `dara-survey-test-${crypto.randomUUID()}`) {
  const repo = createSurveyRepository(name);
  instances.push(repo);
  databases.add(name);
  return { repo, name };
}
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
    expect(loaded.surveys.find((item) => item.id === finished.id)).toEqual(
      finished,
    );
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
    expect((await repo.loadWorkspace()).surveys[0]).toEqual(originalDraft);
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
