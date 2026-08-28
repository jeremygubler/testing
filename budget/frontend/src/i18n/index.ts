import { de, type Translations } from "./de";

export type Language = "de";

const dictionaries: Record<Language, Translations> = { de };

export const DEFAULT_LANGUAGE: Language = "de";

/** Sprache aus dem Locale des Haushalts ableiten (`de-CH` -> `de`). */
export function languageFromLocale(locale: string | undefined): Language {
  const code = (locale ?? "").slice(0, 2).toLowerCase();
  return code in dictionaries ? (code as Language) : DEFAULT_LANGUAGE;
}

export function dictionary(language: Language = DEFAULT_LANGUAGE): Translations {
  return dictionaries[language];
}

/** Platzhalter der Form `{name}` ersetzen. */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

export const t = dictionary();
