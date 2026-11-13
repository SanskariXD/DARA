import { requireWorkspaceSession } from "@/lib/server/access";
import { transcribeWav } from "@/lib/server/live-providers";
import { providerErrorResponse } from "@/lib/server/providers";
import { handleError, HttpError, noStore } from "@/lib/server/http";

export const maxDuration = 40;
const MAX_BYTES = 1_048_576;

/** A self-contained WAV per request avoids MediaRecorder container fragments. */
export function validateWav(bytes: Uint8Array): number {
  const invalid = () =>
    new HttpError(
      400,
      "Record a complete mono 16 kHz PCM WAV clip between 0.1 and 30 seconds.",
    );
  if (bytes.byteLength < 44) throw invalid();
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  if (
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    data.getUint32(4, true) + 8 !== bytes.length
  )
    throw invalid();
  let format = false,
    sampleBytes = -1,
    offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = data.getUint32(offset + 4, true),
      start = offset + 8;
    if (start + size > bytes.length) throw invalid();
    if (tag(offset) === "fmt ") {
      if (
        format ||
        size < 16 ||
        data.getUint16(start, true) !== 1 ||
        data.getUint16(start + 2, true) !== 1 ||
        data.getUint32(start + 4, true) !== 16000 ||
        data.getUint32(start + 8, true) !== 32000 ||
        data.getUint16(start + 12, true) !== 2 ||
        data.getUint16(start + 14, true) !== 16
      )
        throw invalid();
      format = true;
    } else if (tag(offset) === "data") {
      if (sampleBytes !== -1 || size % 2) throw invalid();
      sampleBytes = size;
    }
    offset = start + size + (size % 2);
  }
  const duration = sampleBytes / 32000;
  if (!format || offset !== bytes.length || duration < 0.1 || duration > 30)
    throw invalid();
  return duration;
}

async function boundedFormData(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.startsWith("multipart/form-data;") ||
    !contentType.includes("boundary=")
  )
    throw new HttpError(415, "Upload recording audio as multipart form data.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
    throw new HttpError(
      413,
      "This recording is too large. Use a shorter clip.",
    );
  if (!request.body) throw new HttpError(400, "A recording is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new HttpError(
          413,
          "This recording is too large. Use a shorter clip.",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(body, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new HttpError(400, "The recording upload could not be read.");
  }
}

export async function POST(request: Request) {
  try {
    requireWorkspaceSession(request);
    const form = await boundedFormData(request);
    if (
      [...form.keys()].some(
        (name) => name !== "audio_file" && name !== "language",
      ) ||
      form.getAll("audio_file").length !== 1 ||
      form.getAll("language").length > 1
    )
      throw new HttpError(400, "The recording upload has unexpected fields.");
    const audio = form.get("audio_file"),
      language = form.get("language") ?? "auto";
    if (
      !(audio instanceof Blob) ||
      !["audio/wav", "audio/x-wav", "audio/wave"].includes(audio.type)
    )
      throw new HttpError(415, "This connection accepts PCM WAV recordings.");
    if (
      language !== "auto" &&
      language !== "en" &&
      language !== "kn" &&
      language !== "hi" &&
      language !== "te" &&
      language !== "ta" &&
      language !== "ml"
    )
      throw new HttpError(
        400,
        "Use automatic detection or a supported speech language for this recording.",
      );
    validateWav(new Uint8Array(await audio.arrayBuffer()));
    const result = await transcribeWav(audio, language);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return providerErrorResponse(error) ?? handleError(error);
  }
}
