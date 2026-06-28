import { DEFAULT_LANGUAGE, normalizeLanguage, type Language } from "./languages";
import { en, type LocaleDictionary, type TranslationKey } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { de } from "./locales/de";
import { pt } from "./locales/pt";
import { zh } from "./locales/zh";

/** A flat dictionary: dotted key -> translated string. English is complete; the
 * others are Partial and fall back to English per key. */
export type Dictionary = LocaleDictionary;
export type { TranslationKey };

const DICTIONARIES: Record<Language, LocaleDictionary> = {
  en,
  es,
  fr,
  de,
  pt,
  zh,
};

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** Build a translator for a language. Missing keys fall back to English, then
 * to the raw key (so a forgotten string is visible, not blank). */
export function createTranslator(language: Language): Translator {
  const dict = DICTIONARIES[language] ?? {};
  return (key, vars) => {
    const value = dict[key] ?? en[key] ?? (key as string);
    return interpolate(value, vars);
  };
}

export { DEFAULT_LANGUAGE, normalizeLanguage };
export type { Language };
export { LANGUAGES, languageMeta, contentLanguageName } from "./languages";
