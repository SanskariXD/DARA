import type {
  ExtractionPatch,
  PatchChange,
  TranscriptSegment,
  Visit,
} from "./types";
import { extractionPatchSchema } from "./schema";

/** Exercise the real HTTP boundary online; deterministic fixture replay remains available offline. */
export async function extractDemo(
  visit: Visit,
  segment: TranscriptSegment,
  changes: PatchChange[],
): Promise<ExtractionPatch> {
  if (segment.source !== "demo")
    throw new Error(
      "Only sample conversation segments can use demo extraction.",
    );
  const input = {
    visitId: visit.id,
    householdId: visit.householdId,
    segmentId: segment.id,
    segmentIndex: segment.index,
    baseRevision: visit.revision,
  };
  const offline = () =>
    extractionPatchSchema.parse({
      visitId: visit.id,
      segmentId: segment.id,
      segmentIndex: segment.index,
      baseRevision: visit.revision,
      changes,
    });
  if (typeof navigator !== "undefined" && !navigator.onLine) return offline();
  let response: Response;
  try {
    response = await fetch("/api/demo/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return offline();
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "The sample update took too long. Pause and try again."
        : "The sample could not connect. Your edits are still here.",
    );
  }
  if (!response.ok)
    throw new Error(
      "The sample update could not be completed. Pause and try again.",
    );
  const data = await response.json();
  return extractionPatchSchema.parse(data.patch);
}
