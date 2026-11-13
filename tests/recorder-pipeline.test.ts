import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioSeconds,
  createFlushAcknowledgement,
  encodeWav,
  RecorderPipeline,
  takeAudioBatch,
  takeTextBatch,
  type AudioChunk,
} from "../src/lib/recorder-pipeline";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const chunk = (seconds = 1, value = 0.2): AudioChunk => ({
  frames: [new Float32Array(seconds * 10).fill(value)],
  rate: 10,
});
const enqueue = (pipeline: RecorderPipeline, audio = chunk()) =>
  pipeline.enqueue(audio.frames, audio.rate);

describe("worklet flush acknowledgement", () => {
  afterEach(() => vi.useRealTimers());
  it("accepts a delayed 250ms worklet acknowledgement without losing the tail", async () => {
    vi.useFakeTimers();
    const flush = createFlushAcknowledgement();
    let settled = false;
    void flush.promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(settled).toBe(false);
    flush.acknowledge();
    expect(await flush.promise).toBe(true);
  });
  it("reports a missing acknowledgement as failure after the bounded deadline", async () => {
    vi.useFakeTimers();
    const flush = createFlushAcknowledgement();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await flush.promise).toBe(false);
    flush.acknowledge();
    expect(await flush.promise).toBe(false);
  });
  it("does not mistake cancellation during shutdown for a successful flush", async () => {
    const flush = createFlushAcknowledgement();
    flush.cancel();
    expect(await flush.promise).toBe(false);
  });
});

describe("bounded audio/text batching", () => {
  it("coalesces queued PCM up to 20 seconds without losing or reordering samples", () => {
    const queue = [chunk(8, 1), chunk(8, 2), chunk(8, 3)];
    const first = takeAudioBatch(queue)!;
    expect(audioSeconds(first)).toBe(20);
    expect(
      Array.from(first.frames.flatMap((frame) => Array.from(frame))),
    ).toEqual([
      ...Array(80).fill(1),
      ...Array(80).fill(2),
      ...Array(40).fill(3),
    ]);
    const tail = takeAudioBatch(queue)!;
    expect(audioSeconds(tail)).toBe(4);
    expect(Array.from(tail.frames[0])).toEqual(Array(40).fill(3));
    expect(queue).toHaveLength(0);
  });
  it("keeps different sample rates in separate WAVs", () => {
    const queue = [chunk(1), { frames: [new Float32Array(20)], rate: 20 }];
    expect(takeAudioBatch(queue)?.rate).toBe(10);
    expect(queue).toHaveLength(1);
    expect(takeAudioBatch(queue)?.rate).toBe(20);
  });
  it("coalesces transcript turns verbatim with newline boundaries and an 8000-character ceiling", () => {
    const queue = [
      { text: " First sentence. ", separator: "\n" },
      { text: "Second\nline.", separator: "\n" },
      { text: "x".repeat(8000), separator: "\n" },
    ];
    expect(takeTextBatch(queue)?.text).toBe(" First sentence. \nSecond\nline.");
    expect(takeTextBatch(queue)?.text.length).toBe(8000);
    expect(queue).toHaveLength(0);
  });
  it("encodes a self-contained mono 16kHz signed PCM WAV with clipping", async () => {
    const samples = new Float32Array(1600);
    samples.set([-2, -1, 0, 1, 2]);
    const blob = encodeWav({ frames: [samples], rate: 16000 });
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    expect(blob.type).toBe("audio/wav");
    expect(bytes.byteLength).toBe(3244);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + 2 * i, true))).toEqual(
      [-32768, -32768, 0, 32767, 32767],
    );
  });
  it("retains very short final speech while padding to the endpoint minimum", async () => {
    const blob = encodeWav({ frames: [new Float32Array([0.5])], rate: 16000 });
    const data = new DataView(await blob.arrayBuffer());
    expect(data.getUint32(40, true)).toBe(3200);
    expect(data.getInt16(44, true)).toBe(16383);
    expect(data.getInt16(46, true)).toBe(0);
  });
});

describe("two-stage recorder pipeline", () => {
  it("keeps the detected speech language independent of the interface language", async () => {
    const received: unknown[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: async () => ({ text: "ಅಪ್ಪನಿಗೆ ಬಿಪಿ ಇದೆ", language: "kn" }),
      onTranscript: async (text, language) => {
        received.push({ text, language });
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    expect(await pipeline.drain()).toBe(true);
    expect(received).toEqual([{ text: "ಅಪ್ಪನಿಗೆ ಬಿಪಿ ಇದೆ", language: "kn" }]);
  });
  it("marks coalesced passages from different languages as auto without changing their text", async () => {
    const hold = deferred<void>();
    const received: unknown[] = [];
    const responses = [
      { text: "Start", language: "en" as const },
      { text: "पिताजी को बीपी है", language: "hi" as const },
      { text: "ಅಮ್ಮ ಆರೋಗ್ಯವಾಗಿದ್ದಾರೆ", language: "kn" as const },
    ];
    let count = 0;
    const pipeline = new RecorderPipeline({
      transcribe: async () => responses[count++],
      onTranscript: async (text, language) => {
        received.push({ text, language });
        if (received.length === 1) await hold.promise;
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    await tick();
    enqueue(pipeline);
    await tick();
    enqueue(pipeline);
    await tick();
    hold.resolve();
    expect(await pipeline.drain()).toBe(true);
    expect(received).toEqual([
      { text: "Start", language: "en" },
      { text: "पिताजी को बीपी है\nಅಮ್ಮ ಆರೋಗ್ಯವಾಗಿದ್ದಾರೆ", language: "auto" },
    ]);
  });
  it("runs the next STT request while prior extraction is busy, with one request per stage", async () => {
    const speech = [deferred<string>(), deferred<string>(), deferred<string>()];
    const firstExtraction = deferred<void>();
    const transcripts: string[] = [];
    let speechCalls = 0;
    const pipeline = new RecorderPipeline({
      transcribe: () => speech[speechCalls++].promise,
      onTranscript: async (text) => {
        transcripts.push(text);
        if (transcripts.length === 1) await firstExtraction.promise;
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    enqueue(pipeline);
    await tick();
    expect(speechCalls).toBe(1);
    speech[0].resolve("First answer.");
    await tick();
    expect(transcripts).toEqual(["First answer."]);
    expect(speechCalls).toBe(2); // Gemini #1 remains unresolved.
    enqueue(pipeline);
    speech[1].resolve("Second answer.");
    await tick();
    expect(speechCalls).toBe(3);
    speech[2].resolve("Third answer.");
    await tick();
    expect(transcripts).toHaveLength(1);
    firstExtraction.resolve();
    expect(await pipeline.drain()).toBe(true);
    expect(transcripts).toEqual([
      "First answer.",
      "Second answer.\nThird answer.",
    ]);
  });
  it("coalesces pending audio rather than uploading every original chunk separately", async () => {
    const gate = deferred<string>();
    const durations: number[] = [];
    const transcripts: string[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: async (audio) => {
        durations.push(audioSeconds(audio));
        return durations.length === 1 ? gate.promise : "Later speech";
      },
      onTranscript: async (text) => {
        transcripts.push(text);
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline, chunk(8));
    enqueue(pipeline, chunk(8));
    enqueue(pipeline, chunk(8));
    enqueue(pipeline, chunk(8));
    gate.resolve("First speech");
    expect(await pipeline.drain()).toBe(true);
    expect(durations).toEqual([8, 20, 4]);
    expect(transcripts[0]).toBe("First speech");
  });
  it("automatically signals backpressure after retaining the triggering and final flush chunks", async () => {
    const gate = deferred<string>();
    const durations: number[] = [];
    let pauses = 0;
    const pipeline = new RecorderPipeline({
      transcribe: async (audio) => {
        durations.push(audioSeconds(audio));
        return durations.length === 1 ? gate.promise : "Answer";
      },
      onTranscript: async () => {},
      onError: () => {},
      onBackpressure: () => {
        pauses++;
      },
    });
    for (let i = 0; i < 8; i++) enqueue(pipeline, chunk(8));
    enqueue(pipeline, chunk(1)); // The worklet's final flush after automatic pause.
    expect(pauses).toBe(1);
    expect(pipeline.pendingAudioSeconds).toBe(65);
    gate.resolve("First answer");
    expect(await pipeline.drain()).toBe(true);
    expect(durations.reduce((sum, value) => sum + value, 0)).toBe(65);
    expect(durations.every((value) => value <= 20)).toBe(true);
  });
  it("bounds pending transcript work and suspends more STT until extraction catches up", async () => {
    const speech = [deferred<string>(), deferred<string>(), deferred<string>()];
    const extraction = deferred<void>();
    let calls = 0,
      pauses = 0;
    const texts: string[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: () => speech[calls++].promise,
      onTranscript: async (text) => {
        texts.push(text);
        if (texts.length === 1) await extraction.promise;
      },
      onError: () => {},
      onBackpressure: () => {
        pauses++;
      },
    });
    enqueue(pipeline);
    enqueue(pipeline);
    await tick();
    speech[0].resolve("a".repeat(8000));
    await tick();
    enqueue(pipeline);
    speech[1].resolve("b".repeat(8000));
    await tick();
    expect(calls).toBe(2);
    expect(pauses).toBe(1);
    expect(pipeline.pendingTextChars).toBeLessThanOrEqual(16001);
    extraction.resolve();
    await tick();
    expect(calls).toBe(3);
    speech[2].resolve("Final answer");
    expect(await pipeline.drain()).toBe(true);
    expect(texts.map((text) => text.length)).toEqual([8000, 8000, 12]);
  });
  it("stop/drain waits for both final transcription and final extraction", async () => {
    const speech = deferred<string>(),
      extraction = deferred<void>();
    let settled = false;
    const pipeline = new RecorderPipeline({
      transcribe: () => speech.promise,
      onTranscript: () => extraction.promise,
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    const finished = pipeline.drain().then((value) => {
      settled = true;
      return value;
    });
    await tick();
    expect(settled).toBe(false);
    speech.resolve("Last spoken answer");
    await tick();
    expect(settled).toBe(false);
    extraction.resolve();
    expect(await finished).toBe(true);
    expect(pipeline.hasPending).toBe(false);
  });
  it("retains failed audio and later chunks for an ordered explicit retry", async () => {
    let attempts = 0;
    const transcripts: string[] = [];
    const errors: string[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: async () => {
        attempts++;
        if (attempts === 1) throw new Error("Network unavailable");
        return "Recovered speech";
      },
      onTranscript: async (text) => {
        transcripts.push(text);
      },
      onError: (_, stage) => errors.push(stage),
      onBackpressure: () => {},
    });
    enqueue(pipeline, chunk(10));
    enqueue(pipeline, chunk(10));
    expect(await pipeline.drain()).toBe(false);
    expect(pipeline.hasError).toBe(true);
    expect(pipeline.pendingAudioSeconds).toBe(20);
    expect(errors).toEqual(["speech"]);
    pipeline.retry();
    expect(await pipeline.drain()).toBe(true);
    expect(transcripts).toEqual(["Recovered speech"]);
    expect(pipeline.hasError).toBe(false);
  });
  it("retains failed extraction text and retries without another STT request", async () => {
    let sttCalls = 0,
      extractionCalls = 0;
    const attempts: string[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: async () => {
        sttCalls++;
        return " Keep this exact text. ";
      },
      onTranscript: async (text) => {
        attempts.push(text);
        if (++extractionCalls === 1) throw new Error("Extraction failed");
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    expect(await pipeline.drain()).toBe(false);
    pipeline.retry();
    expect(await pipeline.drain()).toBe(true);
    expect(sttCalls).toBe(1);
    expect(attempts).toEqual([
      " Keep this exact text. ",
      " Keep this exact text. ",
    ]);
  });
  it("keeps the captured callback and language boundary in a session-owned pipeline", async () => {
    const speech = deferred<string>();
    const original: string[] = [];
    const other: string[] = [];
    let selected = (text: string) => {
      original.push(text);
      return Promise.resolve();
    };
    const pipeline = new RecorderPipeline({
      transcribe: () => speech.promise,
      onTranscript: selected,
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    selected = (text: string) => {
      other.push(text);
      return Promise.resolve();
    };
    speech.resolve("Original household answer");
    await pipeline.drain();
    expect(original).toEqual(["Original household answer"]);
    expect(other).toEqual([]);
  });
  it("does not call a transcript handler after cancellation on unmount", async () => {
    const speech = deferred<string>();
    const texts: string[] = [];
    const pipeline = new RecorderPipeline({
      transcribe: () => speech.promise,
      onTranscript: async (text) => {
        texts.push(text);
      },
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    await tick();
    pipeline.cancel();
    speech.resolve("No longer mounted");
    await tick();
    expect(texts).toEqual([]);
  });
  it("cannot retry failed captured audio after an explicit discard", async () => {
    const transcribe = vi.fn(async () => {
      throw new Error("Offline");
    });
    const onTranscript = vi.fn(async () => {});
    const pipeline = new RecorderPipeline({
      transcribe,
      onTranscript,
      onError: () => {},
      onBackpressure: () => {},
    });
    enqueue(pipeline);
    await pipeline.drain();
    expect(pipeline.hasPending).toBe(true);
    pipeline.cancel();
    pipeline.retry();
    enqueue(pipeline);
    await tick();
    expect(pipeline.hasPending).toBe(false);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(onTranscript).not.toHaveBeenCalled();
  });
});
