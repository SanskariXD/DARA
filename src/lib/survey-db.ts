import Dexie from "dexie";
import { z } from "zod";
import { surveySchema, reviewSurvey, type Survey } from "./survey";

export interface SurveyHousehold {
  id: string;
  label: string;
  code: string;
  address: string;
  area?: string;
  createdAt: string;
}
export interface SurveySettings {
  workerName: string;
  area: string;
  language: "en" | "kn" | "hi";
  textSize: "default" | "large";
  audioAlerts: boolean;
}
export interface SurveyWorkspace {
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
});
const settingsSchema = z.object({
  workerName: z.string().max(200),
  area: z.string().max(200),
  language: z.enum(["en", "kn", "hi"]),
  textSize: z.enum(["default", "large"]),
  audioAlerts: z.boolean(),
});
const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

function parseSurvey(value: unknown): Survey {
  const parsed = surveySchema.safeParse(value);
  if (!parsed.success) throw new SurveyStorageDataError();
  return parsed.data;
}

/** No demo data is seeded. This database is separate from previous demo records. */
export function createSurveyRepository(name = "dara-surveys-v1") {
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
  const init = async () =>
    db.transaction("rw", homes, surveys, settings, meta, async () => {
      if (await meta.get("workspace")) return;
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
      await meta.add({ id: "workspace", generation: crypto.randomUUID() });
    });
  const checkGeneration = async () => {
    const marker = await meta.get("workspace");
    if (!generation || marker?.generation !== generation)
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
        households: homeRows.map((row) => parse(householdSchema, row.value)),
        surveys: surveyRows.map((row) => parseSurvey(row.value)),
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
    const snapshot = clone(parseSurvey(value));
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
          await checkGeneration();
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
      const snapshot = clone(parse(householdSchema, value));
      return queue(async () => {
        await init();
        const key = `households:${snapshot.id}`;
        const version = await db.transaction("rw", homes, meta, async () => {
          await checkGeneration();
          const saved = await homes.get(snapshot.id);
          checkVersion(key, saved, snapshot);
          if (saved && equal(saved.value, snapshot)) return saved.version;
          if (saved && saved.value.createdAt !== snapshot.createdAt)
            throw new Error("The household creation date cannot change.");
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
    deleteHousehold: (householdId: string) =>
      queue(async () => {
        const key = `households:${householdId}`;
        await db.transaction("rw", homes, surveys, meta, async () => {
          await checkGeneration();
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
      }),
    saveSurvey: (value: Survey) => persistSurvey(value),
    completeSurvey: (value: Survey) => persistSurvey(value, true),
    saveSettings: (value: SurveySettings) => {
      const snapshot = clone(parse(settingsSchema, value));
      return queue(async () => {
        await init();
        const key = "settings:profile";
        const version = await db.transaction("rw", settings, meta, async () => {
          await checkGeneration();
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
