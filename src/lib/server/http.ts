import { z } from "zod";

export const noStore = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: noStore },
  );
}
/** Read with a byte ceiling even for chunked bodies with no Content-Length. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  limit = 8192,
): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "This request must come from the DARA workspace.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Use application/json.");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw new HttpError(413, "The request is too large.");
  if (!request.body) throw new HttpError(400, "A JSON body is required.");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new HttpError(413, "The request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "The request must contain valid JSON.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new HttpError(400, "The request does not match the expected format.");
  return result.data;
}
export function handleError(error: unknown): Response {
  if (error instanceof HttpError)
    return jsonError(error.status, "INVALID_REQUEST", error.message);
  return jsonError(
    500,
    "REQUEST_FAILED",
    "The request could not be completed. Try again.",
  );
}
