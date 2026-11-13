"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechLanguage } from "@/lib/recorder-pipeline";
import {
  createFlushAcknowledgement,
  encodeWav,
  RecorderPipeline,
} from "@/lib/recorder-pipeline";

export type RecorderStatus =
  "idle" | "recording" | "paused" | "processing" | "error";
const INCOMPLETE_FLUSH =
  "The microphone did not confirm its final audio buffer. Received speech was kept, but the last spoken words may be incomplete. Check the last answer before continuing.";
type Props = {
  language?: SpeechLanguage;
  onTranscript: (text: string, language?: SpeechLanguage) => Promise<void>;
};
type Runtime = {
  ctx: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
  mute: GainNode;
};

export function useRecorder({ language = "auto", onTranscript }: Props) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const latest = useRef({ language, onTranscript });
  latest.current = { language, onTranscript };
  const runtime = useRef<Runtime | null>(null);
  const pipeline = useRef<RecorderPipeline | null>(null);
  const sessionAbort = useRef<AbortController | null>(null);
  const frames = useRef<Float32Array[]>([]),
    samples = useRef(0),
    silence = useRef(0),
    voiced = useRef(false);
  const running = useRef(false),
    mounted = useRef(true),
    session = useRef(0);
  const starting = useRef(false),
    startAttempt = useRef(0),
    resuming = useRef(false),
    captureAttempt = useRef(0);
  const stopping = useRef<Promise<void> | null>(null);
  const pausing = useRef<Promise<boolean> | null>(null);
  const flushIncomplete = useRef(false);
  const flushed = useRef<{
    node: AudioWorkletNode;
    promise: Promise<boolean>;
    resolve: (acknowledged?: boolean) => void;
  } | null>(null);
  const autoPause = useRef<(message: string) => void>(() => undefined);

  const drainAudio = useCallback((node: AudioWorkletNode) => {
    if (flushed.current?.node === node) return flushed.current.promise;
    const acknowledgement = createFlushAcknowledgement();
    const record = {
      node,
      promise: acknowledgement.promise,
      resolve: (received = false) => {
        if (received) acknowledgement.acknowledge();
        else acknowledgement.cancel();
      },
    };
    flushed.current = record;
    void acknowledgement.promise.then(() => {
      if (flushed.current === record) flushed.current = null;
    });
    node.port.postMessage("flush");
    return acknowledgement.promise;
  }, []);

  const release = useCallback(() => {
    running.current = false;
    const current = runtime.current;
    runtime.current = null;
    flushed.current?.resolve();
    if (current) {
      current.node.port.onmessage = null;
      current.node.disconnect();
      current.source.disconnect();
      current.mute.disconnect();
      current.stream.getTracks().forEach((track) => track.stop());
      void current.ctx.close().catch(() => undefined);
    }
  }, []);

  const flush = useCallback((rate: number) => {
    if (!samples.current) return;
    const captured = frames.current;
    const hasVoice = voiced.current;
    frames.current = [];
    samples.current = 0;
    silence.current = 0;
    voiced.current = false;
    // Backpressure is handled only AFTER enqueueing. Captured speech is never
    // discarded because an earlier request is still processing.
    if (hasVoice) pipeline.current?.enqueue(captured, rate);
  }, []);

  const pauseCapture = useCallback(
    (current: Runtime): Promise<boolean> => {
      if (pausing.current) return pausing.current;
      if (!running.current) return Promise.resolve(!flushIncomplete.current);
      const id = session.current;
      current.stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      const operation = (async () => {
        const acknowledged = await drainAudio(current.node);
        if (id !== session.current || runtime.current !== current) return false;
        if (!acknowledged) flushIncomplete.current = true;
        running.current = false;
        flush(current.ctx.sampleRate);
        await current.ctx.suspend().catch(() => undefined);
        return acknowledged;
      })();
      pausing.current = operation;
      void operation.finally(() => {
        if (pausing.current === operation) pausing.current = null;
      });
      return operation;
    },
    [drainAudio, flush],
  );

  autoPause.current = (message: string) => {
    if (!mounted.current) return;
    setError(message);
    captureAttempt.current++;
    const current = runtime.current;
    if (!current) {
      setStatus("error");
      return;
    }
    const id = session.current;
    void pauseCapture(current).then((acknowledged) => {
      if (
        mounted.current &&
        id === session.current &&
        !stopping.current &&
        runtime.current === current
      ) {
        setStatus("paused");
        if (!acknowledged) setError(INCOMPLETE_FLUSH);
      }
    });
  };

  const start = useCallback(async () => {
    if (starting.current || runtime.current || stopping.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Recording requires a supported browser over HTTPS.");
      setStatus("error");
      return;
    }
    starting.current = true;
    const attempt = ++startAttempt.current;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      // Failed work belongs to its original survey callback. Finish it before
      // creating a new session, even if the selected survey has since changed.
      const previous = pipeline.current;
      if (previous?.hasPending) {
        setStatus("processing");
        setError(null);
        previous.retry();
        if (!(await previous.drain())) {
          if (mounted.current) setStatus("error");
          return;
        }
        if (!mounted.current || attempt !== startAttempt.current) return;
      }
      setError(null);
      setElapsed(0);
      flushIncomplete.current = false;
      const id = ++session.current;
      const callback = latest.current.onTranscript;
      const languageCode = latest.current.language;
      const abort = new AbortController();
      sessionAbort.current = abort;
      const currentPipeline = new RecorderPipeline({
        transcribe: async (chunk) => {
          const data = new FormData();
          data.append("audio_file", encodeWav(chunk), "speech.wav");
          data.append("language", languageCode);
          const response = await fetch("/api/speech/transcribe", {
            method: "POST",
            body: data,
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]),
          });
          let result: {
            text?: string;
            language?: string;
            error?: { message?: string };
          };
          try {
            result = await response.json();
          } catch {
            throw new Error("The transcription response could not be read.");
          }
          if (!response.ok)
            throw new Error(
              result.error?.message || "Speech could not be transcribed.",
            );
          if (typeof result.text !== "string" || result.text.length > 8000)
            throw new Error(
              "The speech service returned an incomplete transcript. Captured audio can be retried.",
            );
          const detected = ["en", "kn", "hi", "te", "ta", "ml"].includes(
            result.language ?? "",
          )
            ? (result.language as SpeechLanguage)
            : "auto";
          return { text: result.text, language: detected };
        },
        onTranscript: async (text, detected) => {
          if (id === session.current && mounted.current)
            await callback(text, detected);
        },
        onError: (reason, stage) => {
          if (id !== session.current || !mounted.current) return;
          const detail =
            reason instanceof Error
              ? reason.message
              : "Recording could not be processed.";
          autoPause.current(
            `${detail} ${stage === "speech" ? "Captured audio" : "Transcribed speech"} is kept. Resume to retry, or stop and start again.`,
          );
        },
        onBackpressure: () => {
          if (id !== session.current || !mounted.current) return;
          autoPause.current(
            "Recording paused while earlier speech is processed. All captured speech is kept. Resume when processing catches up.",
          );
        },
      });
      pipeline.current = currentPipeline;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!mounted.current || attempt !== startAttempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule("/pcm-capture.js");
      if (!mounted.current || attempt !== startAttempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
        return;
      }
      const source = ctx.createMediaStreamSource(stream),
        node = new AudioWorkletNode(ctx, "dara-capture"),
        mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      const current = { ctx, stream, node, source, mute };
      runtime.current = current;
      frames.current = [];
      samples.current = 0;
      silence.current = 0;
      voiced.current = false;
      const captureId = ++captureAttempt.current;
      running.current = true;
      const rate = ctx.sampleRate;
      node.port.onmessage = (
        event: MessageEvent<Float32Array | { flushed: boolean }>,
      ) => {
        if (!(event.data instanceof Float32Array)) {
          if (event.data.flushed && flushed.current?.node === node)
            flushed.current.resolve(true);
          return;
        }
        if (
          !running.current ||
          id !== session.current ||
          runtime.current !== current
        )
          return;
        const frame = event.data;
        let power = 0;
        for (const value of frame) power += value * value;
        const speech = Math.sqrt(power / frame.length) > 0.008;
        frames.current.push(frame);
        samples.current += frame.length;
        if (speech) {
          voiced.current = true;
          silence.current = 0;
        } else silence.current += frame.length;
        if (
          samples.current >= rate * 10 ||
          (voiced.current &&
            silence.current >= rate * 0.9 &&
            samples.current >= rate * 1.2)
        )
          flush(rate);
        else if (!voiced.current && samples.current >= rate * 2) {
          frames.current = frames.current.slice(-2);
          samples.current = frames.current.reduce(
            (sum, item) => sum + item.length,
            0,
          );
          silence.current = samples.current;
        }
      };
      await ctx.resume();
      if (!mounted.current || attempt !== startAttempt.current) {
        if (runtime.current === current) release();
        return;
      }
      setStatus(
        captureId === captureAttempt.current && running.current
          ? "recording"
          : "paused",
      );
    } catch (reason) {
      stream?.getTracks().forEach((track) => track.stop());
      if (ctx && ctx.state !== "closed")
        void ctx.close().catch(() => undefined);
      if (!mounted.current || attempt !== startAttempt.current) return;
      release();
      setStatus("error");
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Allow microphone access to record this visit."
          : "The microphone could not be started. Check browser permissions and try again.",
      );
    } finally {
      if (attempt === startAttempt.current) starting.current = false;
    }
  }, [flush, release]);

  const pause = useCallback(async () => {
    const current = runtime.current;
    if (!current) return;
    const id = session.current;
    captureAttempt.current++;
    const acknowledged = await pauseCapture(current);
    if (
      mounted.current &&
      id === session.current &&
      !stopping.current &&
      runtime.current === current
    ) {
      setStatus("paused");
      if (!acknowledged) setError(INCOMPLETE_FLUSH);
    }
  }, [pauseCapture]);

  const resume = useCallback(async () => {
    const current = runtime.current;
    if (!current || resuming.current || stopping.current) return;
    resuming.current = true;
    const id = session.current;
    const captureId = ++captureAttempt.current;
    try {
      if (pausing.current) await pausing.current;
      if (
        captureId !== captureAttempt.current ||
        runtime.current !== current ||
        stopping.current
      )
        return;
      const currentPipeline = pipeline.current;
      if (currentPipeline?.hasError) currentPipeline.retry();
      if (currentPipeline?.backpressured) {
        setError(
          "Earlier speech is still being processed. Captured speech is kept; resume in a moment.",
        );
        return;
      }
      await current.ctx.resume();
      if (
        !mounted.current ||
        id !== session.current ||
        runtime.current !== current ||
        stopping.current
      )
        return;
      if (
        captureId !== captureAttempt.current ||
        currentPipeline?.hasError ||
        currentPipeline?.backpressured
      ) {
        await current.ctx.suspend().catch(() => undefined);
        if (mounted.current && runtime.current === current && !stopping.current)
          setStatus("paused");
        return;
      }
      current.stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      running.current = true;
      setError(flushIncomplete.current ? INCOMPLETE_FLUSH : null);
      setStatus("recording");
    } catch {
      if (
        mounted.current &&
        id === session.current &&
        runtime.current === current &&
        !stopping.current &&
        captureId === captureAttempt.current
      ) {
        setError(
          "Recording could not resume. Stop and start again; captured speech is kept.",
        );
        setStatus("paused");
      }
    } finally {
      if (id === session.current) resuming.current = false;
    }
  }, []);

  const stop = useCallback((): Promise<void> => {
    if (stopping.current) return stopping.current;
    startAttempt.current++;
    starting.current = false;
    captureAttempt.current++;
    const id = session.current;
    const operation = (async () => {
      const current = runtime.current;
      if (current) await pauseCapture(current);
      if (id !== session.current) return;
      release();
      if (mounted.current) setStatus("processing");
      const drained = (await pipeline.current?.drain()) ?? true;
      if (mounted.current && id === session.current) {
        setStatus(drained && !flushIncomplete.current ? "idle" : "error");
        if (flushIncomplete.current) setError(INCOMPLETE_FLUSH);
        else if (drained) setError(null);
      }
    })();
    stopping.current = operation;
    void operation.finally(() => {
      if (stopping.current === operation) stopping.current = null;
    });
    return operation;
  }, [pauseCapture, release]);

  // Only an explicit confirmed reset discards captured work. Normal stop/pause
  // keeps failed queues available for retry.
  const discard = useCallback(() => {
    startAttempt.current++;
    captureAttempt.current++;
    session.current++;
    sessionAbort.current?.abort();
    sessionAbort.current = null;
    pipeline.current?.cancel();
    pipeline.current = null;
    release();
    frames.current = [];
    samples.current = 0;
    silence.current = 0;
    voiced.current = false;
    flushIncomplete.current = false;
    starting.current = false;
    resuming.current = false;
    stopping.current = null;
    pausing.current = null;
    if (mounted.current) {
      setStatus("idle");
      setError(null);
      setElapsed(0);
    }
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      startAttempt.current++;
      captureAttempt.current++;
      session.current++;
      sessionAbort.current?.abort();
      pipeline.current?.cancel();
      release();
    };
  }, [release]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  return {
    status,
    error,
    elapsed,
    start,
    pause,
    resume,
    stop,
    discard,
    // Dismissing a message must never change queue ownership or claim idle while
    // an old survey's transcription/extraction is still processing.
    clearError: () => {
      setError(null);
      if (
        !runtime.current &&
        !starting.current &&
        !stopping.current &&
        !pipeline.current?.hasPending
      )
        setStatus("idle");
    },
  };
}
