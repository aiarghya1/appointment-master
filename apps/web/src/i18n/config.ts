/**
 * Locale and theme preferences.
 *
 * Locale lives in a cookie rather than the URL so server components can render
 * translated text on the first pass — no flash of English, no route
 * restructuring. Theme lives in localStorage instead, because it is applied by
 * a script before first paint and never needs to reach the server.
 */

export const LOCALES = ["en", "hi", "bn", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Shown in the language picker, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
  es: "Español",
  fr: "Français",
};

export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "theme";
