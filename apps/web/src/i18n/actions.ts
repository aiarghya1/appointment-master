"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./config";

/**
 * Stores the chosen language.
 *
 * A server action rather than a client-side cookie write, so the response can
 * revalidate the tree and re-render every server component in the new language
 * in the same round trip.
 */
export async function setLocale(next: string) {
  if (!isLocale(next)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // A display preference, not a credential — the client never needs to read
    // it, so there is no reason to expose it to scripts.
    httpOnly: true,
  });

  revalidatePath("/", "layout");
}
