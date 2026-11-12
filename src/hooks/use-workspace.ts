"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "../data/households";
import * as repository from "../lib/db";
import type { Household, Settings, Visit } from "../lib/types";
import type { Workspace } from "../lib/db";

const initial: Workspace = {
  households: [],
  visits: [],
  settings: DEFAULT_SETTINGS,
};

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(initial);
  const current = useRef<Workspace>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(new Map<string, string>());
  const [saving, setSaving] = useState(false);
  const pending = useRef(0);
  const resetting = useRef(false);
  const alive = useRef(true);
  const replace = useCallback((next: Workspace) => {
    current.current = next;
    if (alive.current) setWorkspace(next);
  }, []);
  const report = useCallback((key: string, reason: unknown) => {
    const message =
      reason instanceof Error
        ? reason.message
        : "Could not save on this device. Keep this page open and export a copy before reloading.";
    failures.current.set(key, message);
    if (alive.current) setError(message);
  }, []);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    repository
      .loadWorkspace()
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
        if (failures.current.delete(key) && alive.current) {
          setError(failures.current.values().next().value ?? null);
        }
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
    async (household: Household) => {
      if (resetting.current)
        throw new Error("Please wait for the demo reset to finish.");
      const index = current.current.households.findIndex(
        (item) => item.id === household.id,
      );
      const households = [...current.current.households];
      if (index >= 0) households[index] = household;
      else households.push(household);
      replace({ ...current.current, households });
      await persist(`household:${household.id}`, () =>
        repository.saveHousehold(household),
      );
    },
    [persist, replace],
  );

  const saveVisit = useCallback(
    async (visit: Visit) => {
      if (resetting.current)
        throw new Error("Please wait for the demo reset to finish.");
      const previous = current.current.visits.find(
        (item) => item.id === visit.id,
      );
      if (previous && previous.revision > visit.revision)
        throw new Error(
          "A newer version of this visit is already open. Refresh the visit before saving.",
        );
      if (
        previous?.status === "completed" &&
        JSON.stringify(previous) !== JSON.stringify(visit)
      )
        throw new Error("Completed visits are read-only.");
      const visits = current.current.visits.filter(
        (item) => item.id !== visit.id,
      );
      visits.push(visit);
      replace({ ...current.current, visits });
      await persist(`visit:${visit.id}`, () => repository.saveVisit(visit));
    },
    [persist, replace],
  );

  const finishVisit = useCallback(
    async (visit: Visit, household: Household) => {
      if (resetting.current)
        throw new Error("Please wait for the demo reset to finish.");
      const previousVisit = current.current.visits.find(
        (item) => item.id === visit.id,
      );
      const previousHousehold = current.current.households.find(
        (item) => item.id === household.id,
      );
      if (!previousHousehold)
        throw new Error("The household is unavailable. Reload before saving.");
      if (previousVisit && previousVisit.revision > visit.revision)
        throw new Error(
          "A newer version of this visit is already open. Refresh the visit before saving.",
        );
      if (
        previousVisit?.status === "completed" &&
        JSON.stringify(previousVisit) !== JSON.stringify(visit)
      )
        throw new Error("Completed visits are read-only.");
      const updatedHousehold = repository.householdAfterVisit(visit, household);
      replace({
        ...current.current,
        visits: [
          ...current.current.visits.filter((item) => item.id !== visit.id),
          visit,
        ],
        households: current.current.households.map((item) =>
          item.id === household.id ? updatedHousehold : item,
        ),
      });
      try {
        await persist(`finish:${visit.id}`, () =>
          repository.completeVisitAndHousehold(visit, updatedHousehold),
        );
        // This transaction also persisted any earlier failed draft/household edits.
        failures.current.delete(`visit:${visit.id}`);
        failures.current.delete(`household:${household.id}`);
        if (alive.current)
          setError(failures.current.values().next().value ?? null);
      } catch (reason) {
        // Neither row was committed. Restore the editable draft, without replacing newer work.
        const visitStillOurs =
          current.current.visits.find((item) => item.id === visit.id) === visit;
        const homeStillOurs =
          current.current.households.find(
            (item) => item.id === household.id,
          ) === updatedHousehold;
        replace({
          ...current.current,
          visits: visitStillOurs
            ? [
                ...current.current.visits.filter(
                  (item) => item.id !== visit.id,
                ),
                ...(previousVisit ? [previousVisit] : []),
              ]
            : current.current.visits,
          households: homeStillOurs
            ? current.current.households.map((item) =>
                item.id === household.id ? previousHousehold : item,
              )
            : current.current.households,
        });
        throw reason;
      }
    },
    [persist, replace],
  );

  const saveSettings = useCallback(
    async (settings: Settings) => {
      if (resetting.current)
        throw new Error("Please wait for the demo reset to finish.");
      replace({ ...current.current, settings });
      await persist("settings", () => repository.saveSettings(settings));
    },
    [persist, replace],
  );

  const resetDemo = useCallback(async () => {
    resetting.current = true;
    try {
      await persist("reset", async () => {
        replace(await repository.clearWorkspace());
        failures.current.clear();
        if (alive.current) {
          setError(null);
          setReady(true);
        }
      });
    } finally {
      resetting.current = false;
    }
  }, [persist, replace]);

  const exportData = useCallback(async () => {
    try {
      // Flush queued writes first. If one failed, include the visible, unsaved values too.
      let persisted: Record<string, unknown>;
      try {
        persisted = await repository.exportWorkspace();
      } catch (reason) {
        // A device-storage outage must not prevent backing up the edits still in memory.
        persisted = {
          schemaVersion: 1,
          syntheticOnly: true,
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
          failures.current.size > 0 ||
          pending.current > 0 ||
          persisted.storageBackupUnavailable ||
          persisted.recovery
            ? "contains-unsaved-changes"
            : "saved-on-this-device",
        ...(failures.current.size > 0
          ? { storageErrors: Object.fromEntries(failures.current) }
          : {}),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dara-demo-records-${new Date().toISOString().slice(0, 10)}.json`;
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
    saveVisit,
    finishVisit,
    saveSettings,
    resetDemo,
    exportData,
  };
}
