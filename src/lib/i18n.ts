import { UI_MESSAGES } from "./locales/ui";

export const APP_LANGUAGES = ["en", "kn", "hi", "te", "ta", "ml"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const LANGUAGE_OPTIONS: { value: AppLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "hi", label: "हिन्दी" },
  { value: "te", label: "తెలుగు" },
  { value: "ta", label: "தமிழ்" },
  { value: "ml", label: "മലയാളം" },
];
export const localeTag = (language: AppLanguage) => `${language}-IN`;
export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" &&
  (APP_LANGUAGES as readonly string[]).includes(value);
export type TranslationParams = Record<string, string | number>;
export type Translate = (source: string, params?: TranslationParams) => string;
const normalize = (source: string) => source.replace(/\s+/g, " ").trim();

/** Only application-authored copy enters this function. Never pass a person's
 * name, transcript, notes, evidence or another free-text answer for translation. */
export function translate(
  language: AppLanguage,
  source: string,
  params: TranslationParams = {},
): string {
  const row = UI_MESSAGES[normalize(source)];
  const translated = language === "en" ? source : (row?.[language] ?? source);
  return translated.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}/g,
    (match, key: string) =>
      Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

type FieldLabel = {
  id: string;
  label: string;
  custom?: boolean;
  options?: { value: string; label: string }[];
};
export function translateFieldLabel(
  language: AppLanguage,
  field: FieldLabel,
): string {
  return field.custom ? field.label : translate(language, field.label);
}
export function translateOptionLabel(
  language: AppLanguage,
  field: FieldLabel,
  option: { value: string; label: string },
): string {
  return field.custom ? option.label : translate(language, option.label);
}
export function formatAppDate(
  language: AppLanguage,
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf())
    ? value
    : new Intl.DateTimeFormat(localeTag(language), options).format(timestamp);
}

/** Localize controlled validation copy while keeping inserted names/content
 * verbatim. Unknown upstream errors remain readable rather than being hidden. */
export function translateMessage(
  language: AppLanguage,
  source: string,
  field?: FieldLabel,
): string {
  const translatedField = (label: string) =>
    field && field.label.toLocaleLowerCase() === label.toLocaleLowerCase()
      ? translateFieldLabel(language, field)
      : label;
  if (language === "en" || UI_MESSAGES[normalize(source)])
    return translate(language, source);
  const rules: {
    pattern: RegExp;
    template: string;
    params: (match: RegExpMatchArray) => TranslationParams;
  }[] = [
    {
      pattern: /^(.+) is required\.$/,
      template: "{field} is required.",
      params: (m) => ({ field: translatedField(m[1]) }),
    },
    {
      pattern: /^(.+) must be a number\.$/,
      template: "{field} must be a number.",
      params: (m) => ({ field: translatedField(m[1]) }),
    },
    {
      pattern: /^(.+) must be text\.$/,
      template: "{field} must be text.",
      params: (m) => ({ field: translatedField(m[1]) }),
    },
    {
      pattern: /^(.+) must be 4,000 characters or fewer\.$/,
      template: "{field} must be 4,000 characters or fewer.",
      params: (m) => ({ field: translatedField(m[1]) }),
    },
    {
      pattern: /^Choose an available (.+) option\.$/i,
      template: "Choose an available {field} option.",
      params: (m) => ({ field: translatedField(m[1]) }),
    },
    {
      pattern:
        /^Check (.+): enter a whole number between ([\d.]+) and ([\d.]+)\.$/i,
      template: "Check {field}: enter a whole number between {min} and {max}.",
      params: (m) => ({ field: translatedField(m[1]), min: m[2], max: m[3] }),
    },
    {
      pattern:
        /^Check (.+): enter (a whole number )?between ([\d.]+) and ([\d.]+)\.$/i,
      template: "Check {field}: enter a value between {min} and {max}.",
      params: (m) => ({ field: translatedField(m[1]), min: m[3], max: m[4] }),
    },
    {
      pattern:
        /^The family count is (\d+), but (\d+) member sections remain\. Recorded answers were kept\. Correct the count or explicitly remove surplus members\.$/,
      template:
        "The family count is {count}, but {sections} member sections remain. Recorded answers were kept. Correct the count or explicitly remove surplus members.",
      params: (m) => ({ count: m[1], sections: m[2] }),
    },
    {
      pattern: /^Review (\d+) items? before completing the survey\.$/,
      template: "Review {count} items before completing the survey.",
      params: (m) => ({ count: m[1] }),
    },
    {
      pattern: /^Family member (\d+)$/,
      template: "Family member {count}",
      params: (m) => ({ count: m[1] }),
    },
  ];
  for (const rule of rules) {
    const match = source.match(rule.pattern);
    if (match) return translate(language, rule.template, rule.params(match));
  }
  return source;
}

export const getTranslator =
  (language: AppLanguage): Translate =>
  (source, params) =>
    translate(language, source, params);
