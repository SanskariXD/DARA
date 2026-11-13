"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applySurveyReconciliation, type Survey } from "@/lib/survey";
import {
  reconcileSurveyBatch,
  reconciliationBatches,
  reconciliationRequest,
  surveyConversationFingerprint,
  surveyFieldFingerprint,
  surveyRosterFingerprint,
} from "@/lib/survey-reconciliation-client";

type Props = {
  survey: Survey | null;
  enabled: boolean;
  offline: boolean;
  getLatest: () => Survey | null;
  commit: (next: Survey) => Promise<void>;
  getProtectedKeys: () => string[];
};
type Status = "idle" | "checking" | "complete" | "error";
type Running = {
  id: string;
  generation?: string;
  controller: AbortController;
  promise: Promise<boolean>;
};

export function useSurveyReconciliation(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const completed = useRef(new Map<string, string>());
  const lastStarted = useRef(new Map<string, number>());
  const failures = useRef(new Map<string, number>());
  const wasOffline = useRef(props.offline);
  const active = useRef<Running | null>(null);
  const alive = useRef(true);
  const fingerprint = props.survey
    ? surveyConversationFingerprint(props.survey)
    : "";
  const isCurrent =
    !props.survey ||
    !props.survey.transcripts.length ||
    props.survey.status === "completed" ||
    completed.current.get(props.survey.id) === fingerprint;

  const cancel = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
    if (alive.current) setStatus("idle");
  }, []);
  const run = useCallback(async (): Promise<boolean> => {
    if (!alive.current) return false;
    const starting = latest.current.getLatest();
    if (
      !starting ||
      starting.status === "completed" ||
      !starting.transcripts.length
    ) {
      if (alive.current) {
        setStatus("complete");
        setError(null);
      }
      return true;
    }
    if (
      completed.current.get(starting.id) ===
      surveyConversationFingerprint(starting)
    ) {
      if (alive.current) setStatus("complete");
      return true;
    }
    if (active.current) return active.current.promise;
    if (latest.current.offline) {
      if (alive.current) {
        setStatus("error");
        setError(
          "You are offline. Check the unanswered questions yourself, or retry the conversation check when connected.",
        );
      }
      return false;
    }
    const attemptFingerprint = surveyConversationFingerprint(starting);
    const controller = new AbortController();
    const job: Running = {
      id: starting.id,
      generation: starting.workspaceGeneration,
      controller,
      promise: Promise.resolve(false),
    };
    active.current = job;
    lastStarted.current.set(starting.id, Date.now());
    setStatus("checking");
    setError(null);
    setProgress({ checked: 0, total: starting.transcripts.length });
    const currentForJob = () => {
      const current = latest.current.getLatest();
      if (
        controller.signal.aborted ||
        active.current !== job ||
        !current ||
        current.id !== job.id ||
        current.workspaceGeneration !== job.generation ||
        current.status !== "draft"
      )
        return null;
      return current;
    };
    job.promise = (async () => {
      // A second sweep is useful only if missing names/count were recovered in
      // the first sweep. It reconsiders later references with the recovered roster.
      let source = starting;
      for (let pass = 0; pass < 2; pass++) {
        const initialRoster = surveyRosterFingerprint(source);
        const initialFields = surveyFieldFingerprint(source);
        const sourceTranscriptKey = source.transcripts
          .map((item) => `${item.id}:${item.index}:${item.text}`)
          .join("\n");
        const batches = reconciliationBatches(source.transcripts);
        let checked = 0;
        setProgress({ checked, total: source.transcripts.length });
        for (let index = 0; index < batches.length; index++) {
          const current = currentForJob();
          if (!current) return false;
          const batch = batches[index];
          // JSON limits count bytes, so Indic text can need smaller batches.
          if (
            new TextEncoder().encode(reconciliationRequest(current, batch))
              .byteLength > 256000 &&
            batch.length > 1
          ) {
            const half = Math.ceil(batch.length / 2);
            batches.splice(index, 1, batch.slice(half), batch.slice(0, half));
            index--;
            continue;
          }
          const response = await reconcileSurveyBatch(
            current,
            batch,
            controller.signal,
          );
          let next = currentForJob();
          if (!next) return false;
          const previous = next;
          for (const envelope of [...response.envelopes].sort(
            (a, b) => b.segmentIndex - a.segmentIndex,
          ))
            next = applySurveyReconciliation(
              next,
              envelope,
              latest.current.getProtectedKeys(),
            );
          if (next !== previous) await latest.current.commit(next);
          if (!currentForJob()) return false;
          checked += response.checkedSegmentIds.length;
          if (alive.current)
            setProgress({ checked, total: source.transcripts.length });
        }
        const ending = currentForJob();
        if (!ending) return false;
        const endingTranscriptKey = ending.transcripts
          .map((item) => `${item.id}:${item.index}:${item.text}`)
          .join("\n");
        if (
          sourceTranscriptKey !== endingTranscriptKey ||
          initialFields !== surveyFieldFingerprint(ending)
        ) {
          if (alive.current) setStatus("idle");
          return false;
        }
        if (initialRoster !== surveyRosterFingerprint(ending)) {
          if (pass === 0) {
            source = ending;
            continue;
          }
          if (alive.current) setStatus("idle");
          return false;
        }
        completed.current.set(ending.id, surveyConversationFingerprint(ending));
        failures.current.delete(attemptFingerprint);
        if (alive.current) {
          setStatus("complete");
          setError(null);
        }
        return true;
      }
      return false;
    })()
      .catch((reason) => {
        if (
          !controller.signal.aborted &&
          alive.current &&
          active.current === job
        ) {
          failures.current.set(
            attemptFingerprint,
            (failures.current.get(attemptFingerprint) ?? 0) + 1,
          );
          setError(
            reason instanceof Error
              ? reason.message
              : "The conversation check could not finish. Please try again.",
          );
          setStatus("error");
        }
        return false;
      })
      .finally(() => {
        if (active.current === job) active.current = null;
      });
    return job.promise;
  }, []);

  const ensureReviewed = useCallback(async () => {
    if (active.current) await active.current.promise;
    return run();
  }, [run]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      active.current?.controller.abort();
      active.current = null;
    };
  }, []);
  useEffect(() => {
    cancel();
    setError(null);
    setProgress({ checked: 0, total: 0 });
  }, [props.survey?.id, props.survey?.workspaceGeneration, cancel]);
  useEffect(() => {
    // A connection returning is a fresh opportunity, even after bounded retries.
    if (wasOffline.current && !props.offline) {
      failures.current.clear();
      setStatus("idle");
      setError(null);
    }
    wasOffline.current = props.offline;
  }, [props.offline]);
  useEffect(() => {
    if (
      !props.enabled ||
      props.offline ||
      isCurrent ||
      status === "checking" ||
      (failures.current.get(fingerprint) ?? 0) >= 3 ||
      !props.survey
    )
      return;
    const wait = Math.max(
      1000,
      ((failures.current.get(fingerprint) ?? 0) > 1 ? 60000 : 20000) -
        (Date.now() - (lastStarted.current.get(props.survey.id) ?? 0)),
    );
    const timer = setTimeout(() => {
      void run();
    }, wait);
    return () => clearTimeout(timer);
  }, [
    props.enabled,
    props.offline,
    props.survey?.id,
    fingerprint,
    isCurrent,
    status,
    run,
  ]);
  return {
    status,
    progress,
    error,
    isCurrent,
    ensureReviewed,
    retry: ensureReviewed,
    cancel,
  };
}
