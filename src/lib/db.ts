import Dexie, { type Table } from "dexie";
import { z } from "zod";
import { DEFAULT_SETTINGS, DEMO_HOUSEHOLDS } from "../data/households";
import type { Household, Settings, Visit } from "./types";
import { reviewVisit } from "./engine";

export interface Workspace {
  households: Household[];
  visits: Visit[];
  settings: Settings;
}
interface Stored<T> {
  id: string;
  value: T;
  version: number;
}
interface Meta {
  id: string;
  version: number;
  generation: string;
}

export class StorageConflictError extends Error {
  constructor() {
    super(
      "This record changed in another tab. Your edits are still on screen. Export them or reload before continuing.",
    );
    this.name = "StorageConflictError";
  }
}
export class StorageDataError extends Error {
  constructor() {
    super(
      "Saved records could not be read. Your saved data has not been replaced. Export a backup or reset demo data in Settings.",
    );
    this.name = "StorageDataError";
  }
}

const safeId = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => !["__proto__", "constructor", "prototype"].includes(value),
  );
const text = z.string().max(20000);
const dateString = z
  .string()
  .min(10)
  .max(40)
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
const fieldId = z.enum([
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
]);
const fieldValue = z.union([text, z.number().finite(), z.boolean(), z.null()]);
const householdSchema = z.object({
  id: safeId,
  code: text,
  familyName: text,
  address: text,
  area: text,
  members: z
    .array(
      z.object({
        id: safeId,
        name: text,
        relation: text,
        age: z.number().int().min(0).max(120),
        sex: z.enum(["female", "male", "other"]),
        phone: text.optional(),
        conditions: z.array(text),
      }),
    )
    .min(1)
    .max(100),
  lastVisit: dateString.nullable(),
  nextVisit: dateString.nullable(),
  status: z.enum(["due", "upcoming", "visited"]),
  color: text,
});
const settingsSchema = z.object({
  workerName: text,
  area: text,
  language: z.enum(["en", "kn", "hi"]),
  textSize: z.enum(["default", "large"]),
  audioAlerts: z.boolean(),
});
const visitSchema = z.object({
  id: safeId,
  householdId: safeId,
  status: z.enum(["draft", "completed"]),
  startedAt: dateString,
  updatedAt: dateString,
  completedAt: dateString.nullable(),
  revision: z.number().int().nonnegative(),
  members: z.record(
    safeId,
    z.object({
      values: z.partialRecord(fieldId, fieldValue),
      meta: z.partialRecord(
        fieldId,
        z.object({
          source: z.enum(["existing", "manual", "extracted"]),
          revision: z.number().int().nonnegative(),
          segmentIndex: z.number().int(),
          evidence: text.optional(),
          manuallyProtected: z.boolean(),
        }),
      ),
    }),
  ),
  transcripts: z.array(
    z.object({
      id: safeId,
      index: z.number().int().nonnegative(),
      text,
      timestamp: dateString,
      memberId: safeId,
      language: z.enum(["en", "kn", "hi"]),
      source: z.enum(["demo", "manual", "gnani"]),
    }),
  ),
  processedSegmentIds: z.array(safeId),
  alerts: z.array(
    z.object({
      id: safeId,
      memberId: safeId,
      kind: z.enum(["follow-up", "review"]),
      message: text,
      evidence: text,
      acknowledged: z.boolean(),
    }),
  ),
  conflicts: z.array(
    z.object({
      id: safeId,
      memberId: safeId,
      field: fieldId,
      currentValue: fieldValue,
      proposedValue: fieldValue,
      evidence: text,
      reason: text,
      resolved: z.boolean(),
    }),
  ),
  audit: z.array(
    z.object({
      id: safeId,
      timestamp: dateString,
      memberId: safeId,
      field: fieldId,
      previousValue: fieldValue,
      value: fieldValue,
      source: z.enum(["manual", "extracted", "resolution"]),
      evidence: text.optional(),
    }),
  ),
});

const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Carry reviewed identity corrections forward; new clinical observations remain in the visit. */
export function householdAfterVisit(
  visit: Visit,
  household: Household,
): Household {
  return {
    ...household,
    lastVisit: visit.completedAt,
    status: "visited",
    members: household.members.map((member) => {
      const values = visit.members[member.id]?.values;
      if (!values) return member;
      const name =
        typeof values.name === "string" && values.name.trim()
          ? values.name.trim()
          : member.name;
      const age =
        typeof values.age === "number" &&
        Number.isInteger(values.age) &&
        values.age >= 0 &&
        values.age <= 120
          ? values.age
          : member.age;
      const phone =
        typeof values.phone === "string"
          ? values.phone.trim() || undefined
          : member.phone;
      return {
        ...member,
        name,
        age,
        ...(Object.hasOwn(values, "phone") ? { phone } : {}),
      };
    }),
  };
}

/** A separate instance represents a tab. Versions are checked inside the write transaction. */
export function createWorkspaceRepository(name = "dara-workspace-v1") {
  const db = new Dexie(name);
  db.version(1).stores({
    households: "&id",
    visits: "&id",
    settings: "&id",
    meta: "&id",
  });
  const households = db.table<Stored<Household>, string>("households");
  const visits = db.table<Stored<Visit>, string>("visits");
  const settings = db.table<Stored<Settings>, string>("settings");
  const meta = db.table<Meta, string>("meta");
  const knownVersions = new Map<string, number>();
  let knownGeneration: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => undefined); // A failed write must not poison subsequent backup/reset actions.
    return result;
  };
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new StorageDataError();
    return result.data;
  };
  const init = async () => {
    await db.transaction("rw", households, visits, settings, meta, async () => {
      if (await meta.get("initialized")) return;
      // Do not overwrite records if the initialization marker was corrupted/deleted.
      if (
        (await households.count()) ||
        (await visits.count()) ||
        (await settings.count())
      )
        throw new StorageDataError();
      await households.bulkAdd(
        DEMO_HOUSEHOLDS.map((value) => ({
          id: value.id,
          value: clone(value),
          version: 1,
        })),
      );
      await settings.add({
        id: "profile",
        value: clone(DEFAULT_SETTINGS),
        version: 1,
      });
      await meta.add({
        id: "initialized",
        version: 1,
        generation: crypto.randomUUID(),
      });
    });
  };
  const read = async (rememberVersions = true): Promise<Workspace> => {
    await init();
    return db.transaction("r", households, visits, settings, meta, async () => {
      const marker = await meta.get("initialized");
      if (!marker?.generation) throw new StorageDataError();
      const [hs, vs, setting] = await Promise.all([
        households.toArray(),
        visits.toArray(),
        settings.get("profile"),
      ]);
      const parsedHouseholds = hs.map((row) =>
        parse(householdSchema, row.value),
      );
      const parsedVisits = vs.map((row) => parse(visitSchema, row.value));
      if (!setting) throw new StorageDataError();
      const parsedSettings = parse(settingsSchema, setting.value);
      for (const [table, rows] of [
        ["households", hs],
        ["visits", vs],
        ["settings", [setting]],
      ] as const) {
        for (const row of rows) {
          if (!Number.isInteger(row.version) || row.version < 1)
            throw new StorageDataError();
          if (rememberVersions)
            knownVersions.set(`${table}:${row.id}`, row.version);
        }
      }
      if (rememberVersions) knownGeneration = marker.generation;
      return {
        households: parsedHouseholds,
        visits: parsedVisits,
        settings: parsedSettings,
      };
    });
  };
  const write = async <T>(
    tableName: string,
    table: Table<Stored<T>, string>,
    id: string,
    value: T,
    validate?: (previous: T) => void,
  ) => {
    await init();
    const key = `${tableName}:${id}`;
    const committedVersion = await db.transaction(
      "rw",
      table,
      meta,
      async () => {
        const marker = await meta.get("initialized");
        if (!knownGeneration || marker?.generation !== knownGeneration)
          throw new StorageConflictError();
        const stored = await table.get(id);
        if (stored && equal(stored.value, value)) return stored.version;
        if ((stored?.version ?? 0) !== (knownVersions.get(key) ?? 0))
          throw new StorageConflictError();
        if (stored) validate?.(stored.value);
        const version = (stored?.version ?? 0) + 1;
        await table.put({ id, value, version });
        return version;
      },
    );
    // Update the optimistic version only after the IndexedDB transaction committed.
    knownVersions.set(key, committedVersion);
  };

  return {
    loadWorkspace: () => enqueue(() => read()),
    saveHousehold: (value: Household) => {
      const snapshot = clone(parse(householdSchema, value));
      return enqueue(() =>
        write("households", households, snapshot.id, snapshot),
      );
    },
    saveVisit: (value: Visit) => {
      const snapshot = clone(parse(visitSchema, value));
      return enqueue(() =>
        write("visits", visits, snapshot.id, snapshot, (previous) => {
          if (previous.status === "completed")
            throw new Error(
              "Completed visits are read-only. Start a new visit to record changes.",
            );
          if (
            snapshot.revision < previous.revision ||
            (snapshot.revision === previous.revision &&
              !equal(snapshot, previous))
          )
            throw new StorageConflictError();
          if (snapshot.householdId !== previous.householdId)
            throw new Error(
              "A saved visit cannot move to a different household.",
            );
        }),
      );
    },
    completeVisitAndHousehold: (value: Visit, household: Household) => {
      const snapshot = clone(parse(visitSchema, value));
      if (snapshot.status !== "completed" || !snapshot.completedAt)
        throw new Error("Complete the visit review before saving.");
      if (snapshot.householdId !== household.id)
        throw new Error("The visit and household do not match.");
      if (reviewVisit(snapshot).length)
        throw new Error("Resolve the visit review items before saving.");
      const home = clone(
        parse(householdSchema, householdAfterVisit(snapshot, household)),
      );
      if (
        Object.keys(snapshot.members).some(
          (id) => !home.members.some((member) => member.id === id),
        )
      )
        throw new Error("A visit member is missing from this household.");
      return enqueue(async () => {
        await init();
        const visitKey = `visits:${snapshot.id}`;
        const homeKey = `households:${home.id}`;
        const versions = await db.transaction(
          "rw",
          visits,
          households,
          meta,
          async () => {
            const marker = await meta.get("initialized");
            if (!knownGeneration || marker?.generation !== knownGeneration)
              throw new StorageConflictError();
            const [savedVisit, savedHome] = await Promise.all([
              visits.get(snapshot.id),
              households.get(home.id),
            ]);
            if (!savedHome)
              throw new Error(
                "The household no longer exists. Reload before saving.",
              );
            const sameVisit = savedVisit && equal(savedVisit.value, snapshot);
            const sameHome = equal(savedHome.value, home);
            if (
              (savedVisit?.version ?? 0) !==
                (knownVersions.get(visitKey) ?? 0) &&
              !sameVisit
            )
              throw new StorageConflictError();
            if (
              savedHome.version !== (knownVersions.get(homeKey) ?? 0) &&
              !sameHome
            )
              throw new StorageConflictError();
            if (savedVisit && !sameVisit) {
              if (savedVisit.value.status === "completed")
                throw new Error(
                  "Completed visits are read-only. Start a new visit to record changes.",
                );
              if (snapshot.revision <= savedVisit.value.revision)
                throw new StorageConflictError();
              if (snapshot.householdId !== savedVisit.value.householdId)
                throw new Error(
                  "A saved visit cannot move to a different household.",
                );
            }
            const visitVersion = sameVisit
              ? savedVisit.version
              : (savedVisit?.version ?? 0) + 1;
            const homeVersion = sameHome
              ? savedHome.version
              : savedHome.version + 1;
            if (!sameVisit)
              await visits.put({
                id: snapshot.id,
                value: snapshot,
                version: visitVersion,
              });
            if (!sameHome)
              await households.put({
                id: home.id,
                value: home,
                version: homeVersion,
              });
            return { visitVersion, homeVersion };
          },
        );
        knownVersions.set(visitKey, versions.visitVersion);
        knownVersions.set(homeKey, versions.homeVersion);
      });
    },
    saveSettings: (value: Settings) => {
      const snapshot = clone(parse(settingsSchema, value));
      return enqueue(() => write("settings", settings, "profile", snapshot));
    },
    clearWorkspace: () =>
      enqueue(async () => {
        await db.transaction(
          "rw",
          households,
          visits,
          settings,
          meta,
          async () => {
            await Promise.all([
              households.clear(),
              visits.clear(),
              settings.clear(),
              meta.clear(),
            ]);
          },
        );
        knownVersions.clear();
        knownGeneration = undefined;
        return read();
      }),
    exportWorkspace: () =>
      enqueue(async () => {
        const metadata = {
          schemaVersion: 1,
          syntheticOnly: true,
          exportedAt: new Date().toISOString(),
        };
        try {
          return { ...metadata, ...(await read(false)) };
        } catch (reason) {
          if (!(reason instanceof StorageDataError)) throw reason;
          // A raw backup is still possible if schema validation fails. Never auto-repair by deletion.
          return db.transaction(
            "r",
            households,
            visits,
            settings,
            meta,
            async () => ({
              ...metadata,
              recovery: true,
              error: reason.message,
              raw: {
                households: await households.toArray(),
                visits: await visits.toArray(),
                settings: await settings.toArray(),
                meta: await meta.toArray(),
              },
            }),
          );
        }
      }),
    // Exposed for independent repository tests and controlled disposal, never for clearing records.
    close: () => db.close(),
  };
}

let repository: ReturnType<typeof createWorkspaceRepository> | undefined;
const getRepository = () => (repository ??= createWorkspaceRepository());
export const loadWorkspace = () => getRepository().loadWorkspace();
export const saveHousehold = (household: Household) =>
  getRepository().saveHousehold(household);
export const saveVisit = (visit: Visit) => getRepository().saveVisit(visit);
export const saveSettings = (settings: Settings) =>
  getRepository().saveSettings(settings);
export const clearWorkspace = () => getRepository().clearWorkspace();
export const exportWorkspace = () => getRepository().exportWorkspace();

export const completeVisitAndHousehold = (visit: Visit, household: Household) =>
  getRepository().completeVisitAndHousehold(visit, household);
