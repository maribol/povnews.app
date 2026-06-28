import { useEffect, useMemo } from "react";
import { useStorage } from "../newtab/hooks/useStorage";
import { STORAGE_KEYS } from "../storage/schema";
import { createTranslator, normalizeLanguage, type Language, type Translator } from "./index";

/**
 * UI translation hook. Reads the user's language from chrome.storage (reactively,
 * so switching it in Settings re-localizes every open surface instantly) and
 * returns a memoized translator plus the active language code.
 *
 * Also reflects the language onto <html lang> for accessibility / hyphenation.
 */
export function useTranslation(): { t: Translator; language: Language; setLanguage: (lang: Language) => void } {
  const [stored] = useStorage(STORAGE_KEYS.language);
  const language = normalizeLanguage(stored);
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    void chrome.storage.local.set({ [STORAGE_KEYS.language]: lang });
  };

  return { t, language, setLanguage };
}
