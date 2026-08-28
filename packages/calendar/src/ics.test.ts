import { describe, expect, it } from "vitest";
import { buildInvite, type Invite } from "./ics";

const base: Invite = {
  uid: "eeb0ac5f-0000-4000-8000-000000000001",
  summary: "30 Minute Meeting",
  start: new Date("2026-08-31T04:30:00.000Z"),
  end: new Date("2026-08-31T05:00:00.000Z"),
  organizer: { name: "Arghya Polley", email: "host@example.com" },
  attendee: { name: "Sam Reader", email: "sam@example.com" },
  now: new Date("2026-08-28T12:00:00.000Z"),
};

const lines = (ics: string) => ics.split("\r\n");
/** Long properties are folded across lines, so join them back before asserting. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const find = (ics: string, prefix: string) =>
  lines(unfold(ics)).find((l) => l.startsWith(prefix));

describe("buildInvite", () => {
  it("emits a REQUEST that a mail client will treat as an invitation", () => {
    const ics = buildInvite(base);
    expect(find(ics, "METHOD:")).toBe("METHOD:REQUEST");
    expect(find(ics, "BEGIN:VCALENDAR")).toBeDefined();
    expect(find(ics, "END:VCALENDAR")).toBeDefined();
    expect(find(ics, "STATUS:")).toBe("STATUS:CONFIRMED");
  });

  it("formats instants as UTC date-times", () => {
    const ics = buildInvite(base);
    expect(find(ics, "DTSTART:")).toBe("DTSTART:20260831T043000Z");
    expect(find(ics, "DTEND:")).toBe("DTEND:20260831T050000Z");
    expect(find(ics, "DTSTAMP:")).toBe("DTSTAMP:20260828T120000Z");
  });

  it("carries the booking uid so a later update replaces the event", () => {
    expect(find(buildInvite(base), "UID:")).toBe(`UID:${base.uid}`);
    expect(find(buildInvite(base), "SEQUENCE:")).toBe("SEQUENCE:0");
    expect(find(buildInvite({ ...base, sequence: 2 }), "SEQUENCE:")).toBe("SEQUENCE:2");
  });

  it("marks the attendee as needing to respond", () => {
    const ics = buildInvite(base);
    const attendee = find(ics, "ATTENDEE")!;
    expect(attendee).toContain('CN="Sam Reader"');
    expect(attendee).toContain("RSVP=TRUE");
    expect(attendee).toContain("mailto:sam@example.com");
    expect(find(ics, "ORGANIZER")).toContain("mailto:host@example.com");
  });

  it("cancels via METHOD:CANCEL so the event leaves the calendar", () => {
    const ics = buildInvite({ ...base, status: "cancelled" });
    expect(find(ics, "METHOD:")).toBe("METHOD:CANCEL");
    expect(find(ics, "STATUS:")).toBe("STATUS:CANCELLED");
  });

  it("escapes characters that would otherwise break the field", () => {
    const ics = buildInvite({ ...base, summary: "Design; review, phase 2\\3", description: "a\nb" });
    expect(find(ics, "SUMMARY:")).toBe("SUMMARY:Design\\; review\\, phase 2\\\\3");
    expect(find(ics, "DESCRIPTION:")).toBe("DESCRIPTION:a\\nb");
  });

  it("uses CRLF endings and terminates the file", () => {
    const ics = buildInvite(base);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
    // Every LF must be part of a CRLF pair.
    expect(ics.split("\n").length - 1).toBe(ics.split("\r\n").length - 1);
  });

  it("folds long lines to 75 octets without splitting a character", () => {
    const ics = buildInvite({ ...base, summary: "é".repeat(200) });
    for (const line of lines(ics)) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    // Unfolding (drop CRLF + one leading space) must restore the original.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"é".repeat(200)}`);
  });

  it("omits an absent description rather than emitting an empty one", () => {
    expect(find(buildInvite(base), "DESCRIPTION:")).toBeUndefined();
  });

  it("refuses a zero-length or reversed booking", () => {
    expect(() => buildInvite({ ...base, end: base.start })).toThrow(RangeError);
    expect(() => buildInvite({ ...base, end: new Date("2026-08-31T04:00:00Z") })).toThrow(RangeError);
  });

  it("refuses an invalid date rather than emitting NaN", () => {
    expect(() => buildInvite({ ...base, now: new Date("nope") })).toThrow(RangeError);
  });
});
