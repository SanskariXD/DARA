import { jsonError } from "./http";

export type IntegrationName =
  "extraction" | "speech" | "speech-output" | "authentication" | "cloud-sync";
/** Intentional closed boundary. Never turn a public demo endpoint into a paid, unauthenticated provider proxy. */
export function unavailableIntegration(name: IntegrationName) {
  return jsonError(
    503,
    "INTEGRATION_NOT_CONFIGURED",
    `${name} is not connected in this demo. Manual records and sample conversations are available.`,
  );
}
