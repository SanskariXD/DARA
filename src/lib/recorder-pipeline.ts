/** Two ordered stages: speech requests can overlap the previous text extraction. */
/** A deadline is a failed flush, never an acknowledgement of the final buffer. */
export function createFlushAcknowledgement(timeoutMs = 1500) {
  let finish!: (acknowledged: boolean) => void;
  let settled = false;
  const promise = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const timer = setTimeout(() => settle(false), timeoutMs);
  function settle(acknowledged: boolean) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    finish(acknowledged);
  }
  return {
    promise,
    acknowledge: () => settle(true),
    cancel: () => settle(false),
  };
}

export const MAX_AUDIO_BATCH_SECONDS = 20;
export const MAX_TEXT_BATCH_CHARS = 8000;
export const AUDIO_BACKPRESSURE_SECONDS = 60;
export const TEXT_BACKPRESSURE_CHARS = 16000;

export interface AudioChunk {
  frames: Float32Array[];
  rate: number;
}
export const audioSeconds = (chunk: AudioChunk) =>
  chunk.frames.reduce((sum, frame) => sum + frame.length, 0) / chunk.rate;

/** Removes at most maxSeconds from the head, preserving every sample and its rate. */
export function takeAudioBatch(
  queue: AudioChunk[],
  maxSeconds = MAX_AUDIO_BATCH_SECONDS,
): AudioChunk | null {
  const first = queue[0];
  if (!first) return null;
  const rate = first.rate;
  let remaining = Math.floor(maxSeconds * rate);
  const frames: Float32Array[] = [];
  while (remaining > 0 && queue[0]?.rate === rate) {
    const chunk = queue.shift()!;
    for (let i = 0; i < chunk.frames.length; i++) {
      const frame = chunk.frames[i];
      if (frame.length <= remaining) {
        frames.push(frame);
        remaining -= frame.length;
      } else {
        frames.push(frame.subarray(0, remaining));
        queue.unshift({
          rate,
          frames: [frame.subarray(remaining), ...chunk.frames.slice(i + 1)],
        });
        remaining = 0;
        break;
      }
      if (!remaining && i + 1 < chunk.frames.length) {
        queue.unshift({ rate, frames: chunk.frames.slice(i + 1) });
        break;
      }
    }
  }
  return { frames, rate };
}

/** Encodes a self-contained mono PCM WAV; pads only provider-minimum clips. */
export function encodeWav({ frames, rate }: AudioChunk): Blob {
  const length = frames.reduce((sum, frame) => sum + frame.length, 0);
  if (!Number.isFinite(rate) || rate <= 0 || !length)
    throw new Error("The captured audio is empty.");
  const joined = new Float32Array(length);
  let position = 0;
  for (const frame of frames) {
    joined.set(frame, position);
    position += frame.length;
  }
  const actualCount = Math.floor((length * 16000) / rate);
  const count = Math.max(1600, actualCount); // The endpoint accepts clips >= 0.1s.
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const word = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < actualCount; i++) {
    const sample = Math.max(
      -1,
      Math.min(
        1,
        joined[Math.min(length - 1, Math.floor((i * rate) / 16000))] || 0,
      ),
    );
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 32768 : sample * 32767,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type SpeechLanguage = "auto" | "en" | "kn" | "hi" | "te" | "ta" | "ml";
export interface TextChunk {
  text: string;
  separator: string;
  language?: SpeechLanguage;
}
/** Coalesces pending turns while preserving text verbatim and explicit newlines. */
export function takeTextBatch(
  queue: TextChunk[],
  limit = MAX_TEXT_BATCH_CHARS,
): { text: string; chunks: TextChunk[] } | null {
  if (!queue.length) return null;
  const chunks: TextChunk[] = [];
  let text = "";
  while (queue.length) {
    const next = queue[0];
    const separator = chunks.length ? next.separator : "";
    if (text.length + separator.length + next.text.length > limit) break;
    queue.shift();
    chunks.push(next);
    text += separator + next.text;
  }
  return chunks.length ? { text, chunks } : null;
}

type Options = {
  transcribe: (
    audio: AudioChunk,
  ) => Promise<string | { text: string; language: SpeechLanguage }>;
  onTranscript: (text: string, language?: SpeechLanguage) => Promise<void>;
  onError: (error: unknown, stage: "speech" | "extraction") => void;
  onBackpressure: () => void;
  onChange?: () => void;
};

export class RecorderPipeline {
  private audio: AudioChunk[] = [];
  private text: TextChunk[] = [];
  private audioTask: Promise<void> | null = null;
  private textTask: Promise<void> | null = null;
  private activeAudioSeconds = 0;
  private activeTextChars = 0;
  private audioFailed = false;
  private textFailed = false;
  private canceled = false;
  private pressureNotified = false;
  constructor(private readonly options: Options) {}

  get hasError() {
    return this.audioFailed || this.textFailed;
  }
  get hasPending() {
    return !!(
      this.audio.length ||
      this.text.length ||
      this.audioTask ||
      this.textTask
    );
  }
  get pendingAudioSeconds() {
    return (
      this.activeAudioSeconds +
      this.audio.reduce((sum, chunk) => sum + audioSeconds(chunk), 0)
    );
  }
  get pendingTextChars() {
    return (
      this.activeTextChars +
      this.text.reduce(
        (sum, chunk) => sum + chunk.text.length + chunk.separator.length,
        0,
      )
    );
  }
  get backpressured() {
    return (
      this.pendingAudioSeconds >= AUDIO_BACKPRESSURE_SECONDS ||
      this.pendingTextChars >= TEXT_BACKPRESSURE_CHARS
    );
  }

  enqueue(frames: Float32Array[], rate: number) {
    if (this.canceled || !frames.some((frame) => frame.length)) return;
    this.audio.push({ frames, rate });
    this.changed();
    this.pumpAudio();
  }
  retry() {
    if (this.canceled) return;
    this.audioFailed = false;
    this.textFailed = false;
    this.pumpText();
    this.pumpAudio();
    this.changed();
  }
  cancel() {
    this.canceled = true;
    // Only unmount or an explicit confirmed reset cancels captured work.
    // Queue pressure and normal stop preserve it for retry.
    this.audio = [];
    this.text = [];
  }
  private changed() {
    if (this.canceled) return;
    if (this.backpressured && !this.pressureNotified) {
      this.pressureNotified = true;
      this.options.onBackpressure();
    } else if (!this.backpressured) this.pressureNotified = false;
    this.options.onChange?.();
  }
  private pumpAudio() {
    if (
      this.canceled ||
      this.audioTask ||
      this.audioFailed ||
      this.textFailed ||
      !this.audio.length ||
      this.pendingTextChars >= TEXT_BACKPRESSURE_CHARS
    )
      return;
    const batch = takeAudioBatch(this.audio)!;
    this.activeAudioSeconds = audioSeconds(batch);
    this.audioTask = (async () => {
      await Promise.resolve();
      try {
        const response = await this.options.transcribe(batch);
        const transcript =
          typeof response === "string" ? response : response.text;
        const language =
          typeof response === "string" ? "auto" : response.language;
        if (this.canceled) return;
        if (transcript.trim()) {
          // Provider responses are limited to 8,000 chars. Retain a longer
          // unexpected response in contiguous pieces instead of dropping it.
          for (
            let offset = 0;
            offset < transcript.length;
            offset += MAX_TEXT_BATCH_CHARS
          ) {
            this.text.push({
              text: transcript.slice(offset, offset + MAX_TEXT_BATCH_CHARS),
              separator: offset ? "" : "\n",
              language,
            });
          }
          this.pumpText();
        }
      } catch (error) {
        if (!this.canceled) {
          this.audio.unshift(batch);
          this.audioFailed = true;
          this.options.onError(error, "speech");
        }
      } finally {
        this.activeAudioSeconds = 0;
        this.audioTask = null;
        this.changed();
        this.pumpText();
        this.pumpAudio();
      }
    })();
  }
  private pumpText() {
    if (this.canceled || this.textTask || this.textFailed || !this.text.length)
      return;
    const batch = takeTextBatch(this.text)!;
    this.activeTextChars = batch.text.length;
    this.textTask = (async () => {
      await Promise.resolve();
      try {
        const languages = new Set(
          batch.chunks.map((chunk) => chunk.language ?? "auto"),
        );
        await this.options.onTranscript(
          batch.text,
          languages.size === 1 ? [...languages][0] : "auto",
        );
      } catch (error) {
        if (!this.canceled) {
          this.text.unshift(...batch.chunks);
          this.textFailed = true;
          this.options.onError(error, "extraction");
        }
      } finally {
        this.activeTextChars = 0;
        this.textTask = null;
        this.changed();
        this.pumpText();
        this.pumpAudio();
      }
    })();
  }
  /** Waits for BOTH stages; false means retained work needs an explicit retry. */
  async drain(): Promise<boolean> {
    this.pumpText();
    this.pumpAudio();
    while (!this.canceled && (this.audioTask || this.textTask)) {
      await Promise.all(
        [this.audioTask, this.textTask].filter(
          (task): task is Promise<void> => !!task,
        ),
      );
      this.pumpText();
      this.pumpAudio();
    }
    return !this.hasPending;
  }
}
