/**
 * iCalendar (RFC 5545) invitation building.
 *
 * Pure: takes a booking and returns the text of a `.ics` file. No I/O, no
 * clock — `now` is passed in — so the output is byte-for-byte assertable in
 * tests rather than merely eyeballed in a mail client.
 *
 * The point of emitting `METHOD:REQUEST` with both an ORGANIZER and an
 * ATTENDEE is that mail clients treat it as an actual invitation: Gmail offers
 * it to Google Calendar, and the event carries the booking's own UID, so a
 * later update or cancellation for the same UID replaces the event instead of
 * creating a second one.
 */

export type InviteStatus = "confirmed" | "tentative" | "cancelled";

export interface Invite {
  /** Stable across updates for this booking — the booking's public uid. */
  uid: string;
  summary: string;
  description?: string | undefined;
  start: Date;
  end: Date;
  organizer: { name?: string | undefined; email: string };
  attendee: { name?: string | undefined; email: string };
  status?: InviteStatus | undefined;
  /**
   * Bumped when re-sending a changed booking. Clients ignore an update whose
   * sequence is not greater than the one they already hold.
   */
  sequence?: number | undefined;
  /** Injected so output is deterministic; defaults to the real clock. */
  now?: Date | undefined;
}

/** RFC 5545 §3.3.5 — UTC date-time, e.g. 20260831T043000Z. */
function stamp(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date passed to buildInvite");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 §3.3.11 — backslash, semicolon, comma and newline carry meaning in
 * a property value, so they are escaped. A colon does not and is left alone.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Quoted parameter values cannot contain a double quote; drop it. */
function escapeParam(value: string): string {
  return value.replace(/"/g, "");
}

/**
 * RFC 5545 §3.1 — no line may exceed 75 octets. Continuations begin with one
 * space. Folding counts octets rather than characters, so a multi-byte name
 * cannot be split mid-character and arrive as mojibake.
 */
function fold(line: string): string[] {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return [line];

  const out: string[] = [];
  let cursor = 0;
  let limit = 75;

  while (cursor < bytes.length) {
    let take = Math.min(limit, bytes.length - cursor);
    // Never split a UTF-8 sequence: back off while the next byte is a
    // continuation byte (10xxxxxx).
    while (take > 1 && (bytes[cursor + take]! & 0xc0) === 0x80) take--;
    out.push(bytes.subarray(cursor, cursor + take).toString("utf8"));
    cursor += take;
    limit = 74; // subsequent lines lose one octet to the leading space
  }

  return out.map((part, i) => (i === 0 ? part : ` ${part}`));
}

function person(role: "ORGANIZER" | "ATTENDEE", who: { name?: string | undefined; email: string }) {
  const name = who.name ? `;CN="${escapeParam(who.name)}"` : "";
  const extra =
    role === "ATTENDEE" ? ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE" : "";
  return `${role}${name}${extra}:mailto:${who.email}`;
}

const STATUS: Record<InviteStatus, string> = {
  confirmed: "CONFIRMED",
  tentative: "TENTATIVE",
  cancelled: "CANCELLED",
};

/**
 * Builds the invitation. A cancelled booking is emitted as `METHOD:CANCEL`,
 * which is what removes the event from the attendee's calendar rather than
 * leaving a stale one behind.
 */
export function buildInvite(invite: Invite): string {
  if (invite.end <= invite.start) {
    throw new RangeError("Invite end must be after its start");
  }

  const status = invite.status ?? "confirmed";
  const method = status === "cancelled" ? "CANCEL" : "REQUEST";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment Master//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `DTSTAMP:${stamp(invite.now ?? new Date())}`,
    `DTSTART:${stamp(invite.start)}`,
    `DTEND:${stamp(invite.end)}`,
    `SEQUENCE:${invite.sequence ?? 0}`,
    `STATUS:${STATUS[status]}`,
    `SUMMARY:${escapeText(invite.summary)}`,
    ...(invite.description ? [`DESCRIPTION:${escapeText(invite.description)}`] : []),
    person("ORGANIZER", invite.organizer),
    person("ATTENDEE", invite.attendee),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF is required by the spec, and Outlook in particular rejects LF-only.
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}
