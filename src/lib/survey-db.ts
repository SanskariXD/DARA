import Dexie from "dexie";
import { z } from "zod";
import {
  surveySchema,
  reviewSurvey,
  migrateDraftSurvey,
  type Survey,
} from "./survey";
import {
  EXAMPLE_SEED_VERSION,
  getExampleWorkspace,
} from "../data/survey-examples";

export interface SurveyHousehold {
  id: string;
  label: string;
  code: string;
  address: string;
  area?: string;
  createdAt: string;
  source?: "example";
  workspaceGeneration?: string;
}
export interface SurveySettings {
  workerName: string;
  area: string;
  language: "en" | "kn" | "hi" | "te" | "ta" | "ml";
  textSize: "default" | "large";
  audioAlerts: boolean;
}
export interface SurveyWorkspace {
  generation: string;
  households: SurveyHousehold[];
  surveys: Survey[];
  settings: SurveySettings;
}
export const DEFAULT_SURVEY_SETTINGS: SurveySettings = {
  workerName: "",
  area: "",
  language: "en",
  textSize: "default",
  audioAlerts: false,
};
interface Stored<T> {
  id: string;
  value: T;
  version: number;
}
interface Metadata {
  id: string;
  generation: string;
}
export class SurveyStorageConflict extends Error {
  constructor() {
    super(
      "This record changed in another tab. Your edits are still on screen. Export a copy or reload before continuing.",
    );
    this.name = "SurveyStorageConflict";
  }
}
export class SurveyStorageDataError extends Error {
  constructor() {
    super(
      "Saved records could not be read. Your data has not been replaced. Export a recovery backup before reloading.",
    );
    this.name = "SurveyStorageDataError";
  }
}
const id = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value),
  );
const timestamp = z
  .string()
  .min(10)
  .max(40)
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
const householdSchema = z.object({
  id,
  label: z.string().trim().min(1).max(200),
  code: z.string().max(100),
  address: z.string().max(1000),
  area: z.string().max(200).optional(),
  createdAt: timestamp,
  source: z.literal("example").optional(),
  workspaceGeneration: z.string().min(1).max(200).optional(),
});
const settingsSchema = z.object({
  workerName: z.string().max(200).default(""),
  area: z.string().max(200).default(""),
  language: z.enum(["en", "kn", "hi", "te", "ta", "ml"]).default("en"),
  textSize: z.enum(["default", "large"]).default("default"),
  audioAlerts: z.boolean().default(false),
});
const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
// Workspace epochs belong to the editing session, not the historical survey snapshot.
const withoutGeneration = <T extends { workspaceGeneration?: string }>(
  value: T,
): T => {
  const copy = { ...value };
  delete copy.workspaceGeneration;
  return copy;
};

function parseSurvey(value: unknown): Survey {
  const parsed = surveySchema.safeParse(value);
  if (!parsed.success) throw new SurveyStorageDataError();
  return parsed.data;
}

/** Examples are seeded once without replacing existing entries. Old demo databases stay untouched. */
export function createSurveyRepository(
  name = "dara-surveys-v1",
  options: { seedExamples?: boolean } = {},
) {
  const db = new Dexie(name);
  db.version(1).stores({
    households: "&id",
    surveys: "&id, householdId",
    settings: "&id",
    meta: "&id",
  });
  const homes = db.table<Stored<SurveyHousehold>, string>("households");
  const surveys = db.table<Stored<Survey> & { householdId: string }, string>(
    "surveys",
  );
  const settings = db.table<Stored<SurveySettings>, string>("settings");
  const meta = db.table<Metadata, string>("meta");
  const versions = new Map<string, number>();
  let generation: string | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  const queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = pending.then(operation);
    pending = next.catch(() => undefined);
    return next;
  };
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new SurveyStorageDataError();
    return parsed.data;
  };
  const seedExamples = async (workspaceGeneration: string) => {
    if (
      options.seedExamples === false ||
      (await meta.get(`examples:${EXAMPLE_SEED_VERSION}`))
    )
      return;
    const canonical = getExampleWorkspace();
    const oldCanonical = getExampleWorkspace(1);
    const priorSeedExists = !!(await meta.get("examples:1"));
    for (const home of canonical.households) {
      const existing = await homes.get(home.id);
      if (existing && existing.value.source !== "example") continue;
      const newSurvey = canonical.surveys.find(
        (item) => item.householdId === home.id,
      )!;
      const savedSurvey = await surveys.get(newSurvey.id);
      if (!existing) {
        // A conflicting survey ID is another record, never an invitation to repurpose it.
        if (savedSurvey) continue;
        await homes.add({
          id: home.id,
          value: withoutGeneration(clone(home)),
          version: 1,
        });
        await surveys.add({
          id: newSurvey.id,
          householdId: home.id,
          value: withoutGeneration(clone(newSurvey)),
          version: 1,
        });
        continue;
      }
      if (!savedSurvey && !priorSeedExists) {
        await surveys.add({
          id: newSurvey.id,
          householdId: home.id,
          value: withoutGeneration(clone(newSurvey)),
          version: 1,
        });
        continue;
      }
      const oldHome = oldCanonical.households.find(
        (item) => item.id === home.id,
      );
      const oldSurvey = oldCanonical.surveys.find(
        (item) => item.id === newSurvey.id,
      );
      const history = await surveys
        .where("householdId")
        .equals(home.id)
        .toArray();
      const pristine =
        oldHome &&
        oldSurvey &&
        savedSurvey &&
        existing.value.source === "example" &&
        equal(withoutGeneration(existing.value), oldHome) &&
        equal(withoutGeneration(savedSurvey.value), oldSurvey) &&
        history.every((row) => row.id === newSurvey.id);
      // Only untouched released examples may be refreshed, including their fictional
      // completed snapshots. User history and edits make the whole pair ineligible.
      if (pristine) {
        if (!equal(existing.value, home))
          await homes.put({
            id: home.id,
            value: withoutGeneration(clone(home)),
            version: existing.version + 1,
          });
        if (!equal(savedSurvey.value, newSurvey))
          await surveys.put({
            id: newSurvey.id,
            householdId: home.id,
            value: withoutGeneration(clone(newSurvey)),
            version: savedSurvey.version + 1,
          });
      }
    }
    await meta.put({
      id: `examples:${EXAMPLE_SEED_VERSION}`,
      generation: workspaceGeneration,
    });
  };
  const init = async () =>
    db.transaction("rw", homes, surveys, settings, meta, async () => {
      let marker = await meta.get("workspace");
      if (!marker) {
        if (
          (await homes.count()) ||
          (await surveys.count()) ||
          (await settings.count())
        )
          throw new SurveyStorageDataError();
        await settings.add({
          id: "profile",
          value: clone(DEFAULT_SURVEY_SETTINGS),
          version: 1,
        });
        marker = { id: "workspace", generation: crypto.randomUUID() };
        await meta.add(marker);
      }
      await seedExamples(marker.generation);
      // Migrate only editable drafts. Completed snapshots are never rewritten by an upgrade.
      for (const row of await surveys.toArray()) {
        if (row.value.status !== "draft" || row.value.templateVersion >= 3)
          continue;
        const migrated = migrateDraftSurvey(parseSurvey(row.value));
        // An upgrade must never replace a readable draft with a snapshot that
        // the current reader cannot hydrate. Keep the original for a later fix.
        if (!surveySchema.safeParse(migrated).success) continue;
        if (!equal(migrated, row.value))
          await surveys.put({
            ...row,
            value: withoutGeneration(migrated),
            version: row.version + 1,
          });
      }
    });
  const checkGeneration = async (expectedGeneration = generation) => {
    const marker = await meta.get("workspace");
    if (
      !generation ||
      !expectedGeneration ||
      marker?.generation !== generation ||
      marker.generation !== expectedGeneration
    )
      throw new SurveyStorageConflict();
  };
  const checkVersion = <T>(
    key: string,
    saved: Stored<T> | undefined,
    proposed?: T,
  ) => {
    if (saved && proposed !== undefined && equal(saved.value, proposed)) return;
    if ((saved?.version ?? 0) !== (versions.get(key) ?? 0))
      throw new SurveyStorageConflict();
  };
  const read = async (remember = true): Promise<SurveyWorkspace> => {
    await init();
    return db.transaction("r", homes, surveys, settings, meta, async () => {
      const [homeRows, surveyRows, profile, marker] = await Promise.all([
        homes.toArray(),
        surveys.toArray(),
        settings.get("profile"),
        meta.get("workspace"),
      ]);
      if (!profile || !marker?.generation) throw new SurveyStorageDataError();
      const data = {
        generation: marker.generation,
        households: homeRows.map((row) => ({
          ...parse(householdSchema, row.value),
          workspaceGeneration: marker.generation,
        })),
        surveys: surveyRows.map((row) => ({
          ...parseSurvey(row.value),
          workspaceGeneration: marker.generation,
        })),
        settings: parse(settingsSchema, profile.value),
      };
      const readVersions = new Map<string, number>();
      for (const [table, rows] of [
        ["households", homeRows],
        ["surveys", surveyRows],
        ["settings", [profile]],
      ] as const) {
        for (const row of rows) {
          if (!Number.isInteger(row.version) || row.version < 1)
            throw new SurveyStorageDataError();
          readVersions.set(`${table}:${row.id}`, row.version);
        }
      }
      if (remember) {
        versions.clear();
        for (const [key, version] of readVersions) versions.set(key, version);
        generation = marker.generation;
      }
      return data;
    });
  };
  const persistSurvey = (value: Survey, requireComplete = false) => {
    const expectedGeneration = value.workspaceGeneration ?? generation;
    const snapshot = withoutGeneration(clone(parseSurvey(value)));
    if (
      requireComplete &&
      (snapshot.status !== "completed" || !snapshot.completedAt)
    )
      throw new Error("Complete the survey review before saving.");
    if (snapshot.status === "completed" && reviewSurvey(snapshot).length)
      throw new Error("Resolve the survey review items before saving.");
    return queue(async () => {
      await init();
      const key = `surveys:${snapshot.id}`;
      const version = await db.transaction(
        "rw",
        surveys,
        homes,
        meta,
        async () => {
          await checkGeneration(expectedGeneration);
          const household = await homes.get(snapshot.householdId);
          if (!household)
            throw new Error("Add this household before saving its survey.");
          const saved = await surveys.get(snapshot.id);
          checkVersion(key, saved, snapshot);
          if (saved && equal(saved.value, snapshot)) return saved.version;
          if (saved) {
            if (saved.value.status === "completed")
              throw new Error(
                "Completed surveys are read-only. Start a repeat survey to record changes.",
              );
            if (snapshot.revision <= saved.value.revision)
              throw new SurveyStorageConflict();
            if (
              snapshot.createdAt !== saved.value.createdAt ||
              snapshot.templateId !== saved.value.templateId ||
              snapshot.templateVersion !== saved.value.templateVersion
            )
              throw new Error("The survey creation details cannot change.");
            if (
              snapshot.householdId !== saved.value.householdId ||
              snapshot.repeatOf !== saved.value.repeatOf
            )
              throw new Error(
                "A survey cannot move to another household or change its repeat reference.",
              );
          }
          if (snapshot.repeatOf) {
            const previous = await surveys.get(snapshot.repeatOf);
            if (
              !previous ||
              previous.value.status !== "completed" ||
              previous.value.householdId !== snapshot.householdId ||
              previous.id === snapshot.id
            )
              throw new Error(
                "A repeat survey must refer to a completed survey in this household.",
              );
          }
          const nextVersion = (saved?.version ?? 0) + 1;
          await surveys.put({
            id: snapshot.id,
            householdId: snapshot.householdId,
            value: snapshot,
            version: nextVersion,
          });
          return nextVersion;
        },
      );
      versions.set(key, version);
    });
  };
  return {
    loadWorkspace: () => queue(() => read()),
    saveHousehold: (value: SurveyHousehold) => {
      const expectedGeneration = value.workspaceGeneration ?? generation;
      const snapshot = withoutGeneration(clone(parse(householdSchema, value)));
      return queue(async () => {
        await init();
        const key = `households:${snapshot.id}`;
        const version = await db.transaction("rw", homes, meta, async () => {
          await checkGeneration(expectedGeneration);
          const saved = await homes.get(snapshot.id);
          checkVersion(key, saved, snapshot);
          if (saved && equal(saved.value, snapshot)) return saved.version;
          if (saved && saved.value.createdAt !== snapshot.createdAt)
            throw new Error("The household creation date cannot change.");
          if (saved && saved.value.source !== snapshot.source)
            throw new Error("The record's example provenance cannot change.");
          const nextVersion = (saved?.version ?? 0) + 1;
          await homes.put({
            id: snapshot.id,
            value: snapshot,
            version: nextVersion,
          });
          return nextVersion;
        });
        versions.set(key, version);
      });
    },
    deleteHousehold: (householdId: string) => {
      const expectedGeneration = generation;
      return queue(async () => {
        const key = `households:${householdId}`;
        await db.transaction("rw", homes, surveys, meta, async () => {
          await checkGeneration(expectedGeneration);
          const saved = await homes.get(householdId);
          if (!saved) return;
          checkVersion(key, saved);
          if (await surveys.where("householdId").equals(householdId).count())
            throw new Error(
              "This household has saved surveys. Its records must be preserved.",
            );
          await homes.delete(householdId);
        });
        versions.delete(key);
      });
    },
    saveSurvey: (value: Survey) => persistSurvey(value),
    completeSurvey: (value: Survey) => persistSurvey(value, true),
    saveSettings: (value: SurveySettings) => {
      const expectedGeneration = generation;
      const snapshot = clone(parse(settingsSchema, value));
      return queue(async () => {
        await init();
        const key = "settings:profile";
        const version = await db.transaction("rw", settings, meta, async () => {
          await checkGeneration(expectedGeneration);
          const saved = await settings.get("profile");
          checkVersion(key, saved, snapshot);
          if (saved && equal(saved.value, snapshot)) return saved.version;
          const nextVersion = (saved?.version ?? 0) + 1;
          await settings.put({
            id: "profile",
            value: snapshot,
            version: nextVersion,
          });
          return nextVersion;
        });
        versions.set(key, version);
      });
    },
    resetUserEntries: () => {
      const expectedGeneration = generation;
      return queue(async () => {
        const canonical = getExampleWorkspace();
        const nextGeneration = crypto.randomUUID();
        await db.transaction("rw", homes, surveys, settings, meta, async () => {
          await checkGeneration(expectedGeneration);
          // Preferences are deliberately kept in place, including their storage version.
          await homes.clear();
          await surveys.clear();
          await homes.bulkAdd(
            canonical.households.map((home) => ({
              id: home.id,
              value: withoutGeneration(clone(home)),
              version: 1,
            })),
          );
          await surveys.bulkAdd(
            canonical.surveys.map((survey) => ({
              id: survey.id,
              householdId: survey.householdId,
              value: withoutGeneration(clone(survey)),
              version: 1,
            })),
          );
          await meta.put({ id: "workspace", generation: nextGeneration });
          await meta.put({
            id: `examples:${EXAMPLE_SEED_VERSION}`,
            generation: nextGeneration,
          });
        });
        versions.clear();
        generation = nextGeneration;
        return read();
      });
    },
    exportWorkspace: () =>
      queue(async () => {
        const header = {
          schemaVersion: 1,
          dataMode: "local-device",
          exportedAt: new Date().toISOString(),
        };
        try {
          return { ...header, ...(await read(false)) };
        } catch (reason) {
          if (!(reason instanceof SurveyStorageDataError)) throw reason;
          return db.transaction(
            "r",
            homes,
            surveys,
            settings,
            meta,
            async () => ({
              ...header,
              recovery: true,
              error: reason.message,
              raw: {
                households: await homes.toArray(),
                surveys: await surveys.toArray(),
                settings: await settings.toArray(),
                metadata: await meta.toArray(),
              },
            }),
          );
        }
      }),
    close: () => db.close(),
  };
}
let repository: ReturnType<typeof createSurveyRepository> | undefined;
const getRepository = () => (repository ??= createSurveyRepository());
export const loadSurveyWorkspace = () => getRepository().loadWorkspace();
export const saveSurveyHousehold = (household: SurveyHousehold) =>
  getRepository().saveHousehold(household);
export const deleteSurveyHousehold = (householdId: string) =>
  getRepository().deleteHousehold(householdId);
export const saveSurvey = (survey: Survey) =>
  getRepository().saveSurvey(survey);
export const completeSavedSurvey = (survey: Survey) =>
  getRepository().completeSurvey(survey);
export const saveSurveySettings = (settings: SurveySettings) =>
  getRepository().saveSettings(settings);
export const exportSurveyWorkspace = () => getRepository().exportWorkspace();

export const resetSurveyUserEntries = () => getRepository().resetUserEntries();
