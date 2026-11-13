import { CARE_COPY } from "./care";
import { ADDITIONAL_COPY } from "./additions";
import { VALIDATION_COPY } from "./validation";
import { ERROR_COPY } from "./errors";
import { CORE_COPY } from "./core";
import { INTRO_COPY } from "./intro";
import { SETTINGS_COPY } from "./settings";
import { RECORDING_COPY } from "./recording";
import { FORM_COPY } from "./forms";

export type LocalizedCopy = Record<"kn" | "hi" | "te" | "ta" | "ml", string>;
export const UI_MESSAGES: Record<string, LocalizedCopy> = {};
for (const row of [
  CORE_COPY,
  FORM_COPY,
  INTRO_COPY,
  SETTINGS_COPY,
  RECORDING_COPY,
  ERROR_COPY,
  VALIDATION_COPY,
  ADDITIONAL_COPY,
  CARE_COPY,
]
  .map((copy) => copy.trim())
  .join("\n")
  .split("\n")) {
  const [source, kn, hi, te, ta, ml, extra] = row.split("|");
  if (!source || !kn || !hi || !te || !ta || !ml || extra !== undefined)
    throw new Error("Invalid local translation entry: " + source);
  if (UI_MESSAGES[source])
    throw new Error("Duplicate local translation entry: " + source);
  UI_MESSAGES[source] = { kn, hi, te, ta, ml };
}
