import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/**
 * Server-side locale resolution.
 *
 * Reading the cookie here — rather than translating in the browser — means the
 * first HTML response is already in the right language. No flash of English,
 * and the page stays translated with JavaScript disabled.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  // An unknown or tampered cookie falls back rather than throwing; a bad
  // cookie should never be able to take a public booking page down.
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
