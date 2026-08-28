import "server-only";

import { buildInvite } from "@appointment-master/calendar";
import { DateTime } from "luxon";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * Booking notifications.
 *
 * One job: send the attendee an email carrying a calendar invitation, so the
 * time is blocked out wherever they keep their calendar rather than only in
 * this application's database.
 *
 * Nothing here may break a booking. The meeting is already committed by the
 * time this runs — the row is written and the exclusion constraint has
 * accepted it — so a mail provider being down, rate-limiting, or unconfigured
 * must degrade to "no email" and never to "no booking". Every path therefore
 * returns a result instead of throwing.
 */

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "failed"; detail?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface BookingNotification {
  uid: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  /** Rendered in the attendee's own zone — the whole point of the email. */
  timeZone: string;
  locale: Locale;
  dict: Dictionary;
  pending: boolean;
  host: { name: string | null; email: string };
  attendee: { name: string; email: string };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(booking: BookingNotification): string {
  const start = DateTime.fromJSDate(booking.start, { zone: booking.timeZone })
    .setLocale(booking.locale);
  const end = DateTime.fromJSDate(booking.end, { zone: booking.timeZone })
    .setLocale(booking.locale);
  // The zone name is included deliberately: an attendee who booked from a
  // phone in another country needs to see which clock this refers to.
  return `${start.toLocaleString(DateTime.DATETIME_HUGE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`;
}

/**
 * Body copy is assembled from the dictionary the page already uses, so the
 * email arrives in the same language the attendee just booked in without a
 * second set of translations to keep in step.
 */
function render(booking: BookingNotification) {
  const c = booking.dict.confirmation;
  const heading = booking.pending ? c.pending : c.booked;
  const when = formatWhen(booking);
  const who = [booking.host.name, booking.attendee.name].filter(Boolean).join(` ${c.and} `);

  const rows: [string, string][] = [
    [c.what, booking.title],
    [c.when, when],
    [c.who, who],
    ...(booking.description ? ([[c.notes, booking.description]] as [string, string][]) : []),
  ];

  const text = [heading, "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16181d">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:18px;font-weight:600">${escapeHtml(heading)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`,
  )
  .join("")}
</table>
</div></body></html>`;

  return { subject: `${heading}: ${booking.title}`, html, text };
}

/**
 * Sends the invitation. Returns `not-configured` rather than failing when no
 * mail provider is set up, which is the normal state for a local checkout and
 * must not turn every booking into an error.
 */
export async function sendBookingInvite(booking: BookingNotification): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: "not-configured" };

  const { subject, html, text } = render(booking);

  const ics = buildInvite({
    uid: booking.uid,
    summary: booking.title,
    description: booking.description ?? undefined,
    start: booking.start,
    end: booking.end,
    organizer: { name: booking.host.name ?? undefined, email: booking.host.email },
    attendee: { name: booking.attendee.name, email: booking.attendee.email },
    // A booking awaiting the host's confirmation is genuinely tentative, and
    // saying so keeps the attendee's calendar honest about what is settled.
    status: booking.pending ? "tentative" : "confirmed",
  });

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [booking.attendee.email],
        subject,
        html,
        text,
        attachments: [
          {
            filename: "invitation.ics",
            content: Buffer.from(ics, "utf8").toString("base64"),
            content_type: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ],
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: "failed", detail: `${response.status} ${await response.text()}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
