"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Survey } from "@/lib/survey";
import {
  applyReconciliationBatch,
  reconcileSurveyBatch,
  reconciliationBatches,
  reconciliationRequest,
  surveyAnswerFingerprint,
  surveyConversationFingerprint,
  surveyFieldFingerprint,
} from "@/lib/survey-reconciliation-client";
import { ReconciliationScheduler } from "@/lib/reconciliation-scheduler";

type Props = {
  survey: Survey | null;
  enabled: boolean;
  offline: boolean;
  getLatest: () => Survey | null;
  commit: (
    identity: { surveyId: string; generation?: string },
    change: (current: Survey) => Survey,
  ) => Promise<Survey | null>;
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
  const scheduler = useRef<ReconciliationScheduler | null>(null);
  const fingerprint = props.survey
    ? surveyConversationFingerprint(props.survey)
    : "";
  const isCurrent =
    !props.survey ||
    !props.survey.transcripts.length ||
    props.survey.status === "completed" ||
    completed.current.get(props.survey.id) === fingerprint;
  const cancel = useCallback(() => {
    scheduler.current?.cancel();
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
      setStatus("complete");
      setError(null);
      return true;
    }
    if (
      completed.current.get(starting.id) ===
      surveyConversationFingerprint(starting)
    ) {
      setStatus("complete");
      return true;
    }
    if (active.current) return active.current.promise;
    if (latest.current.offline) {
      setStatus("error");
      setError(
        "You are offline. Check the unanswered questions yourself, or retry the conversation check when connected.",
      );
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
      let source = starting;
      let expectedFingerprint = attemptFingerprint;
      let externalChange = false;
      // One bounded second sweep lets older correct facts refill a field cleared
      // by a wrong-person repair. Own changes then become the completed checkpoint.
      for (let pass = 0; pass < 2; pass++) {
        const initialAnswers = surveyAnswerFingerprint(source);
        const initialFields = surveyFieldFingerprint(source);
        const sourceTranscriptKey = JSON.stringify(source.transcripts);
        const batches = reconciliationBatches(source.transcripts);
        let checked = 0;
        setProgress({ checked, total: source.transcripts.length });
        for (let index = 0; index < batches.length; index++) {
          const current = currentForJob();
          if (!current) return false;
          if (surveyConversationFingerprint(current) !== expectedFingerprint)
            externalChange = true;
          const batch = batches[index];
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
          if (!currentForJob()) return false;
          let committedFingerprint: string | null = null;
          const committed = await latest.current.commit(
            { surveyId: job.id, generation: job.generation },
            (record) => {
              if (
                !currentForJob() ||
                record.id !== job.id ||
                record.workspaceGeneration !== job.generation
              )
                return record;
              if (
                surveyConversationFingerprint(record) !==
                surveyConversationFingerprint(current)
              )
                externalChange = true;
              const next = applyReconciliationBatch(
                record,
                current,
                response,
                latest.current.getProtectedKeys(),
              );
              committedFingerprint = surveyConversationFingerprint(next);
              return next;
            },
          );
          if (!committed || committedFingerprint === null || !currentForJob())
            return false;
          // A manual edit may land while the ordered persistence queue drains.
          // Compare against what the reducer actually published, not its later return.
          expectedFingerprint = committedFingerprint;
          checked += response.checkedSegmentIds.length;
          if (alive.current)
            setProgress({ checked, total: source.transcripts.length });
        }
        const ending = currentForJob();
        if (!ending) return false;
        if (surveyConversationFingerprint(ending) !== expectedFingerprint)
          externalChange = true;
        if (
          externalChange ||
          sourceTranscriptKey !== JSON.stringify(ending.transcripts) ||
          initialFields !== surveyFieldFingerprint(ending)
        ) {
          setStatus("idle");
          return false;
        }
        if (pass === 0 && initialAnswers !== surveyAnswerFingerprint(ending)) {
          source = ending;
          continue;
        }
        completed.current.set(ending.id, surveyConversationFingerprint(ending));
        failures.current.delete(attemptFingerprint);
        setStatus("complete");
        setError(null);
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
  if (!scheduler.current)
    scheduler.current = new ReconciliationScheduler(() => {
      const survey = latest.current.getLatest();
      const key = survey ? surveyConversationFingerprint(survey) : "";
      const failed = failures.current.get(key) ?? 0;
      return {
        key,
        current:
          !survey ||
          survey.status === "completed" ||
          !survey.transcripts.length ||
          completed.current.get(survey.id) === key,
        enabled:
          alive.current &&
          latest.current.enabled &&
          !latest.current.offline &&
          !!survey &&
          survey.status === "draft" &&
          failed < 3,
        retryAt: failed
          ? (lastStarted.current.get(survey?.id ?? "") ?? 0) +
            (failed > 1 ? 15000 : 3000)
          : undefined,
      };
    }, run);
  const ensureReviewed = useCallback(() => scheduler.current!.flush(), []);
  const retry = useCallback(() => {
    const survey = latest.current.getLatest();
    if (survey) failures.current.delete(surveyConversationFingerprint(survey));
    return scheduler.current!.flush();
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      scheduler.current?.cancel();
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
    if (wasOffline.current && !props.offline) {
      failures.current.clear();
      setStatus("idle");
      setError(null);
    }
    if (props.offline) cancel();
    wasOffline.current = props.offline;
  }, [props.offline, cancel]);
  useEffect(() => {
    scheduler.current?.refresh();
  }, [
    props.enabled,
    props.offline,
    props.survey?.id,
    fingerprint,
    isCurrent,
    status,
  ]);
  return { status, progress, error, isCurrent, ensureReviewed, retry, cancel };
}
