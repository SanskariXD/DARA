import { jsonError } from "./http";

export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function providerErrorResponse(error: unknown): Response | null {
  return error instanceof ProviderError
    ? jsonError(error.status, error.code, error.message)
    : null;
}

/** Presence is configuration, not a claim that a credential is currently valid. */
export function providerConfiguration() {
  return {
    speech: process.env.GNANI_API_KEY?.trim() ? "configured" : "not-configured",
    extraction: process.env.GEMINI_API_KEY?.trim()
      ? "configured"
      : "not-configured",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
  };
}
