import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_LANGUAGES,
  LANGUAGE_OPTIONS,
  translate,
  translateFieldLabel,
  translateOptionLabel,
  translateMessage,
  formatAppDate,
} from "../src/lib/i18n";
import { UI_MESSAGES } from "../src/lib/locales/ui";
import {
  FAMILY_HEALTH_TEMPLATE,
  LEGACY_FAMILY_HEALTH_TEMPLATE,
  PREGNANCY_FOLLOW_UP_TEMPLATE,
  RAINY_SEASON_TEMPLATE,
} from "../src/lib/survey";

import {
  PREGNANCY_CARE_FIELDS,
  RAINY_SEASON_FIELDS,
} from "../src/lib/survey-care";

const languages = APP_LANGUAGES.filter((l) => l !== "en");
describe("bundled UI translations", () => {
  it("bundles a complete six-language catalog with matching interpolation placeholders", () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.value)).toEqual([...APP_LANGUAGES]);
    expect(Object.keys(UI_MESSAGES).length).toBeGreaterThan(400);
    for (const [source, row] of Object.entries(UI_MESSAGES)) {
      const params = source.match(/\{\w+\}/g)?.sort() ?? [];
      for (const language of languages) {
        expect(row[language], `${language}: ${source}`).toBeTruthy();
        expect(row[language].match(/\{\w+\}/g)?.sort() ?? [], source).toEqual(
          params,
        );
      }
    }
  });
  it("covers every controlled field and choice in current and historical templates", () => {
    for (const template of [
      FAMILY_HEALTH_TEMPLATE,
      LEGACY_FAMILY_HEALTH_TEMPLATE,
      PREGNANCY_FOLLOW_UP_TEMPLATE,
      RAINY_SEASON_TEMPLATE,
    ]) {
      for (const field of template.fields) {
        expect(UI_MESSAGES[field.label], field.label).toBeDefined();
        for (const option of field.options ?? [])
          expect(UI_MESSAGES[option.label], option.label).toBeDefined();
      }
    }
  });
  it("localizes pregnancy care, rainy-season questions, and counselling choices", () => {
    for (const field of [...PREGNANCY_CARE_FIELDS, ...RAINY_SEASON_FIELDS]) {
      for (const language of languages) {
        expect(
          translateFieldLabel(language, field),
          `${language}: ${field.id}`,
        ).not.toBe(field.label);
        for (const option of field.options ?? []) {
          expect(
            translateOptionLabel(language, field, option),
            `${language}: ${field.id}/${option.value}`,
          ).not.toBe(option.label);
        }
      }
    }
  });
  it("localizes dynamic review questions and repeat-visit confirmation copy", () => {
    for (const key of [
      "Who does this report belong to?",
      "Which answer should be kept?",
      "Which details should be kept in this answer?",
      "Does the conversation support this answer?",
      "Where should this report be recorded?",
      "What should be recorded from this part of the conversation?",
      "Confirm household members",
      "I confirmed who lives in this household.",
      "Previous visit",
      "Suggested date",
      "Pregnancy follow-up",
      "Monsoon visit",
    ])
      for (const language of languages)
        expect(translate(language, key)).not.toBe(key);
  });
  it("covers every literal translation call rendered in the app", () => {
    const source = readFileSync(
      new URL("../src/components/dara-app.tsx", import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse(`"${match[1]}"`);
      expect(UI_MESSAGES[key], key).toBeDefined();
    }
  });
  it("changes controlled labels but preserves user-created labels and choices exactly", () => {
    const custom = { id: "custom-question", label: "Settings", custom: true };
    const controlled = { id: "name", label: "Full name" };
    for (const language of languages) {
      expect(translate(language, "Households")).not.toEqual("Households");
      expect(translateFieldLabel(language, controlled)).not.toEqual(
        "Full name",
      );
      expect(translateFieldLabel(language, custom)).toEqual("Settings");
      expect(
        translateOptionLabel(language, custom, {
          value: "Households",
          label: "Households",
        }),
      ).toEqual("Households");
      expect(
        translateMessage(language, "Settings is required.", custom),
      ).toContain("Settings");
      expect(translateMessage(language, "Settings is required.")).toContain(
        "Settings",
      );
      expect(
        translateMessage(language, "Full name is required.", controlled),
      ).toContain(translate(language, "Full name"));
    }
  });
  it("interpolates without translating supplied names or content, including key collisions", () => {
    for (const language of APP_LANGUAGES) {
      const name = "Households";
      const content = "Ready for your review";
      expect(
        translate(language, "{name}: {content}", { name, content }),
      ).toEqual("Households: Ready for your review");
      expect(
        translate(language, "{count} family members", { count: 3 }),
      ).toContain("3");
      expect(
        translateMessage(language, "Provider sent an unknown response."),
      ).toEqual("Provider sent an unknown response.");
    }
  });
  it("preserves integer validation and formats dates for the selected locale", () => {
    const field = { id: "familySize", label: "Family members" };
    for (const language of languages) {
      const result = translateMessage(
        language,
        "Check family members: enter a whole number between 1 and 30.",
        field,
      );
      expect(result).toEqual(
        translate(
          language,
          "Check {field}: enter a whole number between {min} and {max}.",
          { field: translateFieldLabel(language, field), min: 1, max: 30 },
        ),
      );
      expect(formatAppDate(language, "2026-11-13")).toBe(
        new Intl.DateTimeFormat(`${language}-IN`, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date("2026-11-13")),
      );
    }
    expect(formatAppDate("kn", "not-a-date")).toBe("not-a-date");
  });
});
