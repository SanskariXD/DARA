import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  createWorkspaceRepository,
  StorageConflictError,
  StorageDataError,
} from "../src/lib/db";
import { DEMO_HOUSEHOLDS } from "../src/data/households";
import { getDemoSegments } from "../src/data/demo";
import { createVisit, editField, completeVisit } from "../src/lib/engine";
import type { Visit } from "../src/lib/types";

const opened: Array<ReturnType<typeof createWorkspaceRepository>> = [];
const names: string[] = [];
function repository(name?: string) {
  const database = name ?? `dara-test-${crypto.randomUUID()}`;
  if (!names.includes(database)) names.push(database);
  const repo = createWorkspaceRepository(database);
  opened.push(repo);
  return { repo, name: database };
}
function newVisit(id = "visit1"): Visit {
  return {
    id,
    householdId: "h001",
    status: "draft",
    startedAt: "2026-11-13T08:00:00Z",
    updatedAt: "2026-11-13T08:00:00Z",
    completedAt: null,
    revision: 0,
    members: {
      "h001-m01": { values: { name: "Lakshmi Devi", age: 28 }, meta: {} },
    },
    transcripts: [],
    processedSegmentIds: [],
    alerts: [],
    conflicts: [],
    audit: [],
  };
}
afterEach(async () => {
  opened.splice(0).forEach((repo) => repo.close());
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("device workspace persistence", () => {
  it("initializes exactly once and returns eight synthetic families with no clinical visit fabricated", async () => {
    const { repo, name } = repository();
    const { repo: second } = repository(name);
    const [first, other] = await Promise.all([
      repo.loadWorkspace(),
      second.loadWorkspace(),
    ]);
    expect(first.households).toHaveLength(8);
    expect(first.visits).toEqual([]);
    expect(other.households).toEqual(first.households);
    expect(first.settings.workerName).toBe("Kavitha S.");
  });

  it("serializes rapid draft writes and survives a new tab/reload", async () => {
    const { repo, name } = repository();
    await repo.loadWorkspace();
    const draft = newVisit();
    const edited = {
      ...draft,
      revision: 1,
      members: { "h001-m01": { values: { age: 29 }, meta: {} } },
    } as Visit;
    await Promise.all([repo.saveVisit(draft), repo.saveVisit(edited)]);
    const { repo: reloaded } = repository(name);
    expect((await reloaded.loadWorkspace()).visits[0]).toEqual(edited);
  });

  it("does not let a late response overwrite a newer draft", async () => {
    const { repo } = repository();
    await repo.loadWorkspace();
    await repo.saveVisit({ ...newVisit(), revision: 5 });
    await expect(
      repo.saveVisit({ ...newVisit(), revision: 3 }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await repo.loadWorkspace()).visits[0].revision).toBe(5);
  });

  it("prevents same-revision divergence and preserves completed records", async () => {
    const { repo } = repository();
    await repo.loadWorkspace();
    const draft = newVisit();
    await repo.saveVisit(draft);
    await expect(
      repo.saveVisit({ ...draft, updatedAt: "2026-11-13T08:01:00Z" }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    const done: Visit = {
      ...draft,
      status: "completed",
      completedAt: "2026-11-13T09:00:00Z",
      revision: 1,
    };
    await repo.saveVisit(done);
    await repo.saveVisit(done); // Idempotent completion is safe.
    await expect(
      repo.saveVisit({ ...done, status: "draft", revision: 2 }),
    ).rejects.toThrow("read-only");
    await expect(
      repo.saveVisit({ ...done, revision: 2, members: {} }),
    ).rejects.toThrow("read-only");
  });

  it("detects a concurrent tab write even when its revision is greater", async () => {
    const { repo, name } = repository();
    await repo.loadWorkspace();
    await repo.saveVisit(newVisit());
    const { repo: other } = repository(name);
    await other.loadWorkspace();
    await repo.saveVisit({ ...newVisit(), revision: 1 });
    await expect(
      other.saveVisit({ ...newVisit(), revision: 7 }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await repo.loadWorkspace()).visits[0].revision).toBe(1);
  });

  it("does not treat exporting a newer remote value as permission to overwrite it", async () => {
    const { repo, name } = repository();
    await repo.loadWorkspace();
    await repo.saveVisit(newVisit());
    const { repo: other } = repository(name);
    await other.loadWorkspace();
    await repo.saveVisit({ ...newVisit(), revision: 1 });
    await other.exportWorkspace();
    await expect(
      other.saveVisit({ ...newVisit(), revision: 2 }),
    ).rejects.toBeInstanceOf(StorageConflictError);
  });

  it("serializes reset after pending writes and exports a consistent snapshot", async () => {
    const { repo } = repository();
    await repo.loadWorkspace();
    const write = repo.saveVisit(newVisit());
    const reset = repo.clearWorkspace();
    await Promise.all([write, reset]);
    const exported = await repo.exportWorkspace();
    expect(exported.syntheticOnly).toBe(true);
    expect("visits" in exported).toBe(true);
    if (!("visits" in exported)) throw new Error("Expected a valid export");
    expect(exported.visits).toEqual([]);
    expect(exported.households).toHaveLength(8);
  });

  it("refuses corrupted rows instead of silently replacing user data", async () => {
    const { repo, name } = repository();
    await repo.loadWorkspace();
    const raw = new Dexie(name);
    await raw.open();
    await raw
      .table("households")
      .put({ id: "h001", value: { id: "h001" }, version: 2 });
    raw.close();
    await expect(repo.loadWorkspace()).rejects.toBeInstanceOf(StorageDataError);
    const recovery = await repo.exportWorkspace();
    expect("raw" in recovery).toBe(true);
    if ("raw" in recovery)
      expect(
        recovery.raw.households.find((row) => row.id === "h001")?.value,
      ).toEqual({ id: "h001" });
    const rawAgain = new Dexie(name);
    await rawAgain.open();
    expect((await rawAgain.table("households").get("h001")).value).toEqual({
      id: "h001",
    });
    rawAgain.close();
  });

  it("rejects writes from a tab opened before a reset", async () => {
    const { repo, name } = repository();
    const { repo: other } = repository(name);
    const original = await repo.loadWorkspace();
    await other.loadWorkspace();
    await repo.clearWorkspace();
    await expect(
      other.saveHousehold({
        ...original.households[0],
        familyName: "Stale change",
      }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await repo.loadWorkspace()).households[0].familyName).toBe(
      original.households[0].familyName,
    );
  });

  it("atomically completes a visit and carries forward identity only", async () => {
    const { repo } = repository();
    const loaded = await repo.loadWorkspace();
    const draft = newVisit();
    await repo.saveVisit(draft);
    const done: Visit = {
      ...draft,
      revision: 1,
      status: "completed",
      completedAt: "2026-11-13T09:00:00Z",
      members: {
        "h001-m01": {
          values: {
            name: "Lakshmi D.",
            age: 29,
            symptoms: "No symptoms reported",
            notes: "Visit-only note",
          },
          meta: {},
        },
      },
    };
    await repo.completeVisitAndHousehold(done, loaded.households[0]);
    const saved = await repo.loadWorkspace();
    expect(saved.visits[0]).toEqual(done);
    expect(saved.households[0].lastVisit).toBe(done.completedAt);
    expect(saved.households[0].status).toBe("visited");
    expect(saved.households[0].members[0].name).toBe("Lakshmi D.");
    expect(saved.households[0].members[0].age).toBe(29);
    expect(saved.households[0].members[0].conditions).toEqual([]);
    expect(saved.households[0].members[0]).not.toHaveProperty("notes");
    await repo.completeVisitAndHousehold(done, saved.households[0]);
  });

  it("rolls back the visit if the household write fails within the transaction", async () => {
    const { repo } = repository();
    const loaded = await repo.loadWorkspace();
    const draft = newVisit();
    await repo.saveVisit(draft);
    const done: Visit = {
      ...draft,
      revision: 1,
      status: "completed",
      completedAt: "2026-11-13T09:00:00Z",
      members: {
        "h001-m01": {
          values: {
            name: "Lakshmi Devi",
            age: 28,
            symptoms: "No symptoms reported",
          },
          meta: {},
        },
      },
    };
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "households")
          throw new DOMException("Simulated full device", "QuotaExceededError");
        return original.apply(this, args);
      });
    try {
      await expect(
        repo.completeVisitAndHousehold(done, loaded.households[0]),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    const saved = await repo.loadWorkspace();
    expect(saved.visits[0].status).toBe("draft");
    expect(saved.households[0]).toEqual(loaded.households[0]);
    await repo.completeVisitAndHousehold(done, loaded.households[0]);
    expect((await repo.loadWorkspace()).visits[0].status).toBe("completed");
  });

  it("refuses atomic completion when another tab changed the household", async () => {
    const { repo, name } = repository();
    const loaded = await repo.loadWorkspace();
    const draft = newVisit();
    await repo.saveVisit(draft);
    const { repo: other } = repository(name);
    await other.loadWorkspace();
    await other.saveHousehold({
      ...loaded.households[0],
      address: "Updated address",
    });
    const done: Visit = {
      ...draft,
      revision: 1,
      status: "completed",
      completedAt: "2026-11-13T09:00:00Z",
      members: {
        "h001-m01": {
          values: {
            name: "Lakshmi Devi",
            age: 28,
            symptoms: "No symptoms reported",
          },
          meta: {},
        },
      },
    };
    await expect(
      repo.completeVisitAndHousehold(done, loaded.households[0]),
    ).rejects.toBeInstanceOf(StorageConflictError);
    const saved = await other.loadWorkspace();
    expect(saved.visits[0].status).toBe("draft");
    expect(saved.households[0].address).toBe("Updated address");
  });

  it("refuses atomic completion after another tab resets the workspace", async () => {
    const { repo, name } = repository();
    const loaded = await repo.loadWorkspace();
    const { repo: other } = repository(name);
    await other.loadWorkspace();
    await other.clearWorkspace();
    const done: Visit = {
      ...newVisit(),
      revision: 1,
      status: "completed",
      completedAt: "2026-11-13T09:00:00Z",
      members: {
        "h001-m01": {
          values: {
            name: "Lakshmi Devi",
            age: 28,
            symptoms: "No symptoms reported",
          },
          meta: {},
        },
      },
    };
    await expect(
      repo.completeVisitAndHousehold(done, loaded.households[0]),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await other.loadWorkspace()).visits).toEqual([]);
  });

  it("carries a manually typed numeric age into the household and next visit", async () => {
    const { repo } = repository();
    const loaded = await repo.loadWorkspace();
    const household = loaded.households[0];
    const memberId = household.members[0].id;
    const draft = createVisit(household);
    await repo.saveVisit(draft);
    const corrected = editField(draft, memberId, "age", "29");
    expect(corrected.members[memberId].values.age).toBe("29");
    const ready = editField(corrected, memberId, "symptoms", "No symptoms reported");
    await repo.completeVisitAndHousehold(completeVisit(ready), household);
    const saved = await repo.loadWorkspace();
    const updatedHousehold = saved.households.find((item) => item.id === household.id)!;
    expect(updatedHousehold.members[0].age).toBe(29);
    expect(createVisit(updatedHousehold).members[memberId].values.age).toBe(29);
  });

  it("keeps fixture segment IDs stable, contiguous and evidence attributable", () => {
    const a = getDemoSegments("visit", DEMO_HOUSEHOLDS[0]);
    const b = getDemoSegments("visit", DEMO_HOUSEHOLDS[0]);
    expect(a).toHaveLength(7);
    expect(a.map((step) => step.segment.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(a.map((step) => step.segment.id)).toEqual(
      b.map((step) => step.segment.id),
    );
    for (const step of a)
      for (const change of step.changes) {
        expect(change.memberId).toBe(step.segment.memberId);
        expect(step.segment.text).toContain(change.evidence);
      }
    expect(a[4].segment.memberId).toBe("h001-m02");
  });
});
