"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as storage from "../lib/survey-db";
import type { Survey } from "../lib/survey";
import type {
  SurveyHousehold,
  SurveySettings,
  SurveyWorkspace,
} from "../lib/survey-db";

const initial: SurveyWorkspace = {
  households: [],
  surveys: [],
  settings: storage.DEFAULT_SURVEY_SETTINGS,
};

/** Device-local records only. No account, cloud, or provider connection is implied. */
export function useSurveys() {
  const [workspace, setWorkspace] = useState<SurveyWorkspace>(initial);
  const current = useRef<SurveyWorkspace>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const failures = useRef(new Map<string, string>());
  const pending = useRef(0);
  const alive = useRef(true);
  const replace = useCallback((next: SurveyWorkspace) => {
    current.current = next;
    if (alive.current) setWorkspace(next);
  }, []);
  const report = useCallback((key: string, reason: unknown) => {
    const message =
      reason instanceof Error
        ? reason.message
        : "Could not save on this device. Keep this page open and export your records before reloading.";
    failures.current.set(key, message);
    if (alive.current) setError(message);
  }, []);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    storage
      .loadSurveyWorkspace()
      .then((data) => {
        if (!cancelled) replace(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) report("load", reason);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [replace, report]);
  const persist = useCallback(
    async (key: string, operation: () => Promise<unknown>) => {
      pending.current += 1;
      if (alive.current) setSaving(true);
      try {
        await operation();
        if (failures.current.delete(key) && alive.current)
          setError(failures.current.values().next().value ?? null);
      } catch (reason) {
        report(key, reason);
        throw reason;
      } finally {
        pending.current -= 1;
        if (alive.current) setSaving(pending.current > 0);
      }
    },
    [report],
  );
  const saveHousehold = useCallback(
    async (household: SurveyHousehold) => {
      const existing = current.current.households.some(
        (item) => item.id === household.id,
      );
      replace({
        ...current.current,
        households: existing
          ? current.current.households.map((item) =>
              item.id === household.id ? household : item,
            )
          : [...current.current.households, household],
      });
      await persist(`household:${household.id}`, () =>
        storage.saveSurveyHousehold(household),
      );
    },
    [persist, replace],
  );
  const deleteHousehold = useCallback(
    async (householdId: string) => {
      await persist(`delete:${householdId}`, () =>
        storage.deleteSurveyHousehold(householdId),
      );
      replace({
        ...current.current,
        households: current.current.households.filter(
          (item) => item.id !== householdId,
        ),
      });
      failures.current.delete(`household:${householdId}`);
      if (alive.current)
        setError(failures.current.values().next().value ?? null);
    },
    [persist, replace],
  );
  const checkSurvey = (survey: Survey) => {
    const previous = current.current.surveys.find(
      (item) => item.id === survey.id,
    );
    if (previous && previous.revision > survey.revision)
      throw new Error(
        "A newer version of this survey is open. Refresh the survey before saving.",
      );
    if (
      previous?.status === "completed" &&
      JSON.stringify(previous) !== JSON.stringify(survey)
    )
      throw new Error(
        "Completed surveys are read-only. Start a repeat survey to record changes.",
      );
    return previous;
  };
  const saveSurvey = useCallback(
    async (survey: Survey) => {
      checkSurvey(survey);
      replace({
        ...current.current,
        surveys: [
          ...current.current.surveys.filter((item) => item.id !== survey.id),
          survey,
        ],
      });
      await persist(`survey:${survey.id}`, () => storage.saveSurvey(survey));
    },
    [persist, replace],
  );
  const completeSurvey = useCallback(
    async (survey: Survey) => {
      const previous = checkSurvey(survey);
      replace({
        ...current.current,
        surveys: [
          ...current.current.surveys.filter((item) => item.id !== survey.id),
          survey,
        ],
      });
      try {
        await persist(`complete:${survey.id}`, () =>
          storage.completeSavedSurvey(survey),
        );
        failures.current.delete(`survey:${survey.id}`);
        if (alive.current)
          setError(failures.current.values().next().value ?? null);
      } catch (reason) {
        if (
          current.current.surveys.find((item) => item.id === survey.id) ===
          survey
        ) {
          replace({
            ...current.current,
            surveys: [
              ...current.current.surveys.filter(
                (item) => item.id !== survey.id,
              ),
              ...(previous ? [previous] : []),
            ],
          });
        }
        throw reason;
      }
    },
    [persist, replace],
  );
  const saveSettings = useCallback(
    async (settings: SurveySettings) => {
      replace({ ...current.current, settings });
      await persist("settings", () => storage.saveSurveySettings(settings));
    },
    [persist, replace],
  );
  const exportData = useCallback(async () => {
    try {
      let persisted: Record<string, unknown>;
      try {
        persisted = await storage.exportSurveyWorkspace();
      } catch (reason) {
        persisted = {
          schemaVersion: 1,
          dataMode: "local-device",
          exportedAt: new Date().toISOString(),
          storageBackupUnavailable:
            reason instanceof Error
              ? reason.message
              : "Device storage unavailable",
        };
      }
      const data = {
        ...persisted,
        ...current.current,
        storageStatus:
          failures.current.size ||
          pending.current ||
          persisted.storageBackupUnavailable ||
          persisted.recovery
            ? "contains-unsaved-changes"
            : "saved-on-this-device",
        ...(failures.current.size
          ? { storageErrors: Object.fromEntries(failures.current) }
          : {}),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `dara-records-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      report("export", reason);
      throw reason;
    }
  }, [report]);
  return {
    ready,
    error,
    saving,
    ...workspace,
    saveHousehold,
    deleteHousehold,
    saveSurvey,
    completeSurvey,
    saveSettings,
    exportData,
  };
}
