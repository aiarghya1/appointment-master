"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LOCALES, LOCALE_NAMES, THEMES, THEME_STORAGE_KEY, type Locale, type Theme } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

interface SettingsWidgetProps {
  locale: Locale;
  labels: {
    label: string;
    appearance: string;
    language: string;
    system: string;
    light: string;
    dark: string;
    close: string;
  };
}

/**
 * The bottom-left settings control: appearance and language, nothing else.
 *
 * Theme is written to the document element and to localStorage, so it is a
 * per-viewer preference that never touches the server. Language is a server
 * action, because the pages are server-rendered and the translation has to
 * happen before the HTML is produced.
 */
export function SettingsWidget({ locale, labels }: SettingsWidgetProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Read the stored choice after mount. Rendering it during SSR is impossible
  // — the server cannot know what is in this browser's localStorage — and
  // guessing would mismatch on hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // Private mode and blocked site data both throw on access; the default
      // is correct in that case, so there is nothing to handle.
    }
  }, []);

  const chooseTheme = (next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    // "system" means *remove* the override and let the media query decide,
    // rather than freezing whatever the OS happens to prefer right now.
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;

    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference simply will not persist; the page is still correct now.
    }
  };

  const chooseLocale = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      setOpen(false);
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const themeLabels: Record<Theme, string> = {
    system: labels.system,
    light: labels.light,
    dark: labels.dark,
  };

  return (
    <div ref={rootRef} className="fixed bottom-4 left-4 z-50">
      {open && (
        <div
          role="dialog"
          aria-label={labels.label}
          className="mb-2 w-60 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
        >
          <fieldset className="mb-3">
            <legend className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
              {labels.appearance}
            </legend>
            <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
              {THEMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={theme === option}
                  onClick={() => chooseTheme(option)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    theme === option
                      ? "bg-accent text-white"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {themeLabels[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
              {labels.language}
            </legend>
            <div className="flex flex-col gap-0.5">
              {LOCALES.map((option) => (
                <button
                  key={option}
                  type="button"
                  lang={option}
                  disabled={pending}
                  aria-pressed={locale === option}
                  onClick={() => chooseLocale(option)}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50 ${
                    locale === option
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink hover:bg-surface-sunken"
                  }`}
                >
                  {LOCALE_NAMES[option]}
                  {locale === option && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <button
        type="button"
        aria-label={labels.label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-muted shadow-[var(--shadow-card)] transition-colors hover:border-line-strong hover:text-ink"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
