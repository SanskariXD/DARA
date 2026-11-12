import { z } from "zod";
import { DEMO_HOUSEHOLDS } from "@/data/households";
import { getDemoSegments } from "@/data/demo";
import { readJson, noStore, handleError, jsonError } from "@/lib/server/http";
import { extractionPatchSchema } from "@/lib/schema";

export const maxDuration = 10;
const requestSchema = z
  .object({
    visitId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9_-]+$/),
    householdId: z.string().min(1).max(120),
    segmentId: z.string().min(1).max(160),
    segmentIndex: z.number().int().min(0).max(100),
    baseRevision: z.number().int().nonnegative().max(1000000),
  })
  .strict();
/** Public synthetic fixture endpoint; no user transcript, patient record or provider credential is accepted. */
export async function POST(request: Request) {
  try {
    const input = await readJson(request, requestSchema);
    const household = DEMO_HOUSEHOLDS.find(
      (item) => item.id === input.householdId,
    );
    if (!household)
      return jsonError(
        404,
        "SAMPLE_NOT_FOUND",
        "Sample conversation is available for the example households.",
      );
    const step = getDemoSegments(input.visitId, household).find(
      (item) =>
        item.segment.index === input.segmentIndex &&
        item.segment.id === input.segmentId,
    );
    if (!step)
      return jsonError(
        404,
        "SEGMENT_NOT_FOUND",
        "This sample segment does not exist.",
      );
    const patch = extractionPatchSchema.parse({
      visitId: input.visitId,
      segmentId: input.segmentId,
      segmentIndex: input.segmentIndex,
      baseRevision: input.baseRevision,
      changes: step.changes,
    });
    return Response.json({ mode: "demo", patch }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
