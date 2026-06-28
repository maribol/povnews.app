/**
 * Supported UI + content languages. English is the source of truth and the
 * fallback for any missing key. To add a language: add it here, add a dictionary
 * under ./locales, and register it in ./index.ts.
 */
export type Language = "en" | "es" | "fr" | "de" | "pt" | "zh";

export const DEFAULT_LANGUAGE: Language = "en";

export type LanguageMeta = {
  code: Language;
  /** English label, e.g. "Spanish". */
  label: string;
  /** Endonym shown in the picker, e.g. "Español". */
  nativeLabel: string;
  /**
   * How the AI should be told to write digest content. Distinct from `label`
   * so we can disambiguate regional variants (Brazilian Portuguese, Simplified
   * Chinese) for the generation prompt.
   */
  contentName: string;
};

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "English", nativeLabel: "English", contentName: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español", contentName: "Spanish" },
  { code: "fr", label: "French", nativeLabel: "Français", contentName: "French" },
  { code: "de", label: "German", nativeLabel: "Deutsch", contentName: "German" },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Português (Brasil)",
    contentName: "Brazilian Portuguese",
  },
  {
    code: "zh",
    label: "Chinese",
    nativeLabel: "简体中文",
    contentName: "Simplified Chinese",
  },
];

const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code));

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_CODES.has(value as Language);
}

/** Coerce an arbitrary stored value (or browser locale) to a supported language. */
export function normalizeLanguage(value: unknown): Language {
  if (isLanguage(value)) return value;
  if (typeof value === "string") {
    const base = value.split("-")[0]?.toLowerCase();
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

export function languageMeta(code: Language): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** The English name the generation prompt uses to request content language. */
export function contentLanguageName(code: Language): string {
  return languageMeta(code).contentName;
}
