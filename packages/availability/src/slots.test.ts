import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { generateSlots } from "./slots";
import type { Interval, Schedule, Weekday } from "./types";

const MON = 1 as Weekday;
const FRI = 5 as Weekday;
const SUN = 7 as Weekday;

const at = (iso: string) => new Date(iso);
const windowOf = (startIso: string, endIso: string): Interval => ({
  start: at(startIso),
  end: at(endIso),
});

/** Slot starts rendered as local wall-clock in `zone`, for legible assertions. */
const local = (slots: Interval[], zone: string) =>
  slots.map((s) => DateTime.fromJSDate(s.start, { zone }).toFormat("MM-dd HH:mm"));

/** Slot starts rendered as UTC instants — this is what DST actually moves. */
const utc = (slots: Interval[]) =>
  slots.map((s) => DateTime.fromJSDate(s.start, { zone: "utc" }).toFormat("MM-dd HH:mm'Z'"));

const nineToFive = (zone: string, days: Weekday[]): Schedule => ({
  timeZone: zone,
  rules: days.map((weekday) => ({ weekday, start: 9 * 60, end: 17 * 60 })),
});

describe("generateSlots — basics", () => {
  it("fills a working day at the event duration", () => {
    // Monday 2026-09-07, 09:00–17:00 UTC, hour-long meetings.
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 60 },
    });
    expect(utc(slots)).toEqual([
      "09-07 09:00Z",
      "09-07 10:00Z",
      "09-07 11:00Z",
      "09-07 12:00Z",
      "09-07 13:00Z",
      "09-07 14:00Z",
      "09-07 15:00Z",
      "09-07 16:00Z",
    ]);
  });

  it("never emits a slot that would run past the end of the window", () => {
    // 45-minute meetings in an 8-hour day: the last one starts at 16:00 and
    // ends 16:45; a 16:45 start would spill past 17:00 and must be dropped.
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 45, slotIntervalMinutes: 60 },
    });
    expect(utc(slots).at(-1)).toBe("09-07 16:00Z");
    expect(slots.at(-1)!.end.toISOString()).toBe("2026-09-07T16:45:00.000Z");
  });

  it("separates meeting length from slot granularity", () => {
    // 30-minute meetings offered every 15 minutes — overlapping candidates,
    // which is legitimate: booking one removes the others via busy time.
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-07T12:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: { timeZone: "UTC", rules: [{ weekday: MON, start: 9 * 60, end: 10 * 60 }] },
      eventType: { durationMinutes: 30, slotIntervalMinutes: 15 },
    });
    expect(utc(slots)).toEqual(["09-07 09:00Z", "09-07 09:15Z", "09-07 09:30Z"]);
  });

  it("anchors to the start of the window, not the top of the hour", () => {
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-07T23:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: { timeZone: "UTC", rules: [{ weekday: MON, start: 9 * 60 + 20, end: 11 * 60 }] },
      eventType: { durationMinutes: 30 },
    });
    expect(utc(slots)).toEqual(["09-07 09:20Z", "09-07 09:50Z", "09-07 10:20Z"]);
  });

  it("applies a start offset", () => {
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-07T23:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: { timeZone: "UTC", rules: [{ weekday: MON, start: 9 * 60, end: 11 * 60 }] },
      eventType: { durationMinutes: 30, offsetMinutes: 5 },
    });
    expect(utc(slots)).toEqual(["09-07 09:05Z", "09-07 09:35Z", "09-07 10:05Z"]);
  });

  it("returns the same slot when queried for exactly that slot's window", () => {
    // Regression: the booking flow re-checks a chosen slot by querying just
    // that slot's window before writing. When availability was trimmed to the
    // query window, candidates were re-anchored to the trimmed edge and the
    // slot came back missing — so every booking after the first of the day was
    // silently rejected as a conflict.
    const args = {
      now: at("2026-09-01T00:00:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 30 },
    };
    const wholeDay = generateSlots({
      ...args,
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
    });
    expect(wholeDay.length).toBeGreaterThan(4);

    for (const slot of wholeDay) {
      const exact = generateSlots({ ...args, window: { start: slot.start, end: slot.end } });
      expect(exact.map((s) => s.start.toISOString())).toEqual([slot.start.toISOString()]);
    }
  });

  it("treats a narrower window as a filter, never a re-anchoring", () => {
    const args = {
      now: at("2026-09-01T00:00:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 60 },
    };
    const wide = generateSlots({
      ...args,
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
    });
    // A window starting mid-morning must not shift the grid to 10:30, 11:30…
    const narrow = generateSlots({
      ...args,
      window: windowOf("2026-09-07T10:30:00Z", "2026-09-07T14:00:00Z"),
    });

    expect(utc(narrow)).toEqual(["09-07 11:00Z", "09-07 12:00Z", "09-07 13:00Z"]);
    expect(utc(wide)).toEqual(expect.arrayContaining(utc(narrow)));
  });

  it("rejects a non-positive duration", () => {
    expect(() =>
      generateSlots({
        window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
        now: at("2026-09-01T00:00:00Z"),
        schedule: nineToFive("UTC", [MON]),
        eventType: { durationMinutes: 0 },
      }),
    ).toThrow(RangeError);
  });
});

describe("generateSlots — time zones", () => {
  it("resolves a half-hour-offset zone correctly", () => {
    // 09:00 IST is 03:30Z. India has no DST, so this holds year-round.
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: nineToFive("Asia/Kolkata", [MON]),
      eventType: { durationMinutes: 60 },
    });
    expect(utc(slots)[0]).toBe("09-07 03:30Z");
    expect(local(slots, "Asia/Kolkata")[0]).toBe("09-07 09:00");
  });

  it("keeps wall-clock time stable across a DST boundary while the instant moves", () => {
    // The host said "9am Mondays". That must stay 9am on both sides of the
    // spring-forward transition — even though the UTC instant shifts by an hour.
    const schedule = nineToFive("America/New_York", [MON]);
    const before = generateSlots({
      window: windowOf("2026-03-02T00:00:00Z", "2026-03-03T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule,
      eventType: { durationMinutes: 60 },
    });
    const after = generateSlots({
      window: windowOf("2026-03-09T00:00:00Z", "2026-03-10T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule,
      eventType: { durationMinutes: 60 },
    });

    expect(local(before, "America/New_York")[0]).toBe("03-02 09:00");
    expect(local(after, "America/New_York")[0]).toBe("03-09 09:00");

    expect(utc(before)[0]).toBe("03-02 14:00Z"); // EST, UTC-5
    expect(utc(after)[0]).toBe("03-09 13:00Z"); // EDT, UTC-4
  });

  it("loses the skipped hour on a spring-forward morning", () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 in New York. A 01:00–04:00 window
    // is three hours on the wall but only two hours of real time, so an hourly
    // event yields two slots, not three.
    const slots = generateSlots({
      window: windowOf("2026-03-08T00:00:00Z", "2026-03-09T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule: {
        timeZone: "America/New_York",
        rules: [{ weekday: SUN, start: 60, end: 4 * 60 }],
      },
      eventType: { durationMinutes: 60 },
    });
    expect(utc(slots)).toEqual(["03-08 06:00Z", "03-08 07:00Z"]);
    expect(local(slots, "America/New_York")).toEqual(["03-08 01:00", "03-08 03:00"]);
  });

  it("gains the repeated hour on a fall-back morning", () => {
    // 2026-11-01: clocks fall 02:00 → 01:00. A 01:00–03:00 window is two hours
    // on the wall but three hours of real time, so we offer three slots.
    const slots = generateSlots({
      window: windowOf("2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule: {
        timeZone: "America/New_York",
        rules: [{ weekday: SUN, start: 60, end: 3 * 60 }],
      },
      eventType: { durationMinutes: 60 },
    });
    expect(utc(slots)).toEqual(["11-01 05:00Z", "11-01 06:00Z", "11-01 07:00Z"]);
  });

  it("handles a southern-hemisphere zone transitioning the other way", () => {
    // Australia moves *to* DST on 2026-10-04, so the instant moves earlier.
    // Note the windows straddle the UTC day boundary: Sydney's 09:00 falls on
    // the previous UTC date, which is exactly the trap the next test pins down.
    const schedule = nineToFive("Australia/Sydney", [SUN]);
    const before = generateSlots({
      window: windowOf("2026-09-26T00:00:00Z", "2026-09-28T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule,
      eventType: { durationMinutes: 60 },
    });
    const after = generateSlots({
      window: windowOf("2026-10-03T00:00:00Z", "2026-10-05T00:00:00Z"),
      now: at("2026-01-01T00:00:00Z"),
      schedule,
      eventType: { durationMinutes: 60 },
    });
    expect(local(before, "Australia/Sydney")[0]).toBe("09-27 09:00");
    expect(local(after, "Australia/Sydney")[0]).toBe("10-04 09:00");
    expect(utc(before)[0]).toBe("09-26 23:00Z"); // AEST, UTC+10
    expect(utc(after)[0]).toBe("10-03 22:00Z"); // AEDT, UTC+11
  });

  it("clips strictly to the requested window, which callers must build in local time", () => {
    // A UTC-aligned "day" is not a local day anywhere but UTC. Sydney's Sunday
    // 09:00 sits at 2026-09-26T23:00Z, so a window starting at 2026-09-27T00:00Z
    // legitimately misses it. Callers asking for "Sunday in Sydney" must derive
    // the window from the local date, not from a UTC midnight.
    const args = {
      now: at("2026-01-01T00:00:00Z"),
      schedule: nineToFive("Australia/Sydney", [SUN]),
      eventType: { durationMinutes: 60 },
    };
    const utcDay = generateSlots({
      ...args,
      window: windowOf("2026-09-27T00:00:00Z", "2026-09-28T00:00:00Z"),
    });
    const localDay = generateSlots({
      ...args,
      window: windowOf("2026-09-26T14:00:00Z", "2026-09-27T14:00:00Z"),
    });

    expect(local(utcDay, "Australia/Sydney")[0]).toBe("09-27 10:00"); // first hour lost
    expect(local(localDay, "Australia/Sydney")[0]).toBe("09-27 09:00"); // full day intact
    expect(localDay).toHaveLength(8);
  });

  it("rejects an unknown zone loudly", () => {
    expect(() =>
      generateSlots({
        window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
        now: at("2026-09-01T00:00:00Z"),
        schedule: nineToFive("Mars/Olympus_Mons", [MON]),
        eventType: { durationMinutes: 60 },
      }),
    ).toThrow(/Unknown IANA time zone/);
  });
});

describe("generateSlots — availability spanning midnight", () => {
  it("carries a night shift into the following day", () => {
    // Friday 22:00 → Saturday 02:00, expressed as minutes 1320 → 1560.
    const slots = generateSlots({
      window: windowOf("2026-09-11T00:00:00Z", "2026-09-13T00:00:00Z"),
      now: at("2026-09-01T00:00:00Z"),
      schedule: {
        timeZone: "UTC",
        rules: [{ weekday: FRI, start: 22 * 60, end: 26 * 60 }],
      },
      eventType: { durationMinutes: 60 },
    });
    expect(utc(slots)).toEqual([
      "09-11 22:00Z",
      "09-11 23:00Z",
      "09-12 00:00Z",
      "09-12 01:00Z",
    ]);
  });
});

describe("generateSlots — busy time and buffers", () => {
  const mondayNineToFive = {
    window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
    now: at("2026-09-01T00:00:00Z"),
    schedule: nineToFive("UTC", [MON]),
  };

  it("removes slots that collide with existing commitments", () => {
    const slots = generateSlots({
      ...mondayNineToFive,
      eventType: { durationMinutes: 60 },
      busy: [
        { start: at("2026-09-07T11:00:00Z"), end: at("2026-09-07T12:00:00Z") },
        { start: at("2026-09-07T14:30:00Z"), end: at("2026-09-07T15:00:00Z") },
      ],
    });
    expect(utc(slots)).toEqual([
      "09-07 09:00Z",
      "09-07 10:00Z",
      "09-07 12:00Z",
      "09-07 13:00Z",
      "09-07 15:00Z",
      "09-07 16:00Z",
    ]);
  });

  it("treats a busy range that merely abuts a slot as no conflict", () => {
    const slots = generateSlots({
      ...mondayNineToFive,
      eventType: { durationMinutes: 60 },
      busy: [{ start: at("2026-09-07T10:00:00Z"), end: at("2026-09-07T11:00:00Z") }],
    });
    expect(utc(slots)).toContain("09-07 09:00Z"); // ends exactly at 10:00
    expect(utc(slots)).toContain("09-07 11:00Z"); // starts exactly at 11:00
    expect(utc(slots)).not.toContain("09-07 10:00Z");
  });

  it("widens the conflict zone by the configured buffers", () => {
    // A 30-minute buffer on each side means the 10:00 and 12:00 slots — which
    // would otherwise merely abut the 11:00–12:00 commitment — are also gone.
    const slots = generateSlots({
      ...mondayNineToFive,
      eventType: { durationMinutes: 60, beforeBufferMinutes: 30, afterBufferMinutes: 30 },
      busy: [{ start: at("2026-09-07T11:00:00Z"), end: at("2026-09-07T12:00:00Z") }],
    });
    expect(utc(slots)).toEqual(["09-07 09:00Z", "09-07 13:00Z", "09-07 14:00Z", "09-07 15:00Z", "09-07 16:00Z"]);
  });

  it("merges overlapping busy ranges rather than double-counting them", () => {
    const slots = generateSlots({
      ...mondayNineToFive,
      eventType: { durationMinutes: 60 },
      busy: [
        { start: at("2026-09-07T10:00:00Z"), end: at("2026-09-07T12:00:00Z") },
        { start: at("2026-09-07T11:00:00Z"), end: at("2026-09-07T13:00:00Z") },
      ],
    });
    expect(utc(slots)).toEqual(["09-07 09:00Z", "09-07 13:00Z", "09-07 14:00Z", "09-07 15:00Z", "09-07 16:00Z"]);
  });
});

describe("generateSlots — minimum notice", () => {
  it("hides slots that start too soon", () => {
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
      now: at("2026-09-07T09:30:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 60, minimumNoticeMinutes: 120 },
    });
    // Earliest bookable instant is 11:30, so 12:00 is the first surviving slot.
    expect(utc(slots)[0]).toBe("09-07 12:00Z");
  });

  it("returns nothing when notice consumes the whole day", () => {
    const slots = generateSlots({
      window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
      now: at("2026-09-07T09:00:00Z"),
      schedule: nineToFive("UTC", [MON]),
      eventType: { durationMinutes: 60, minimumNoticeMinutes: 60 * 24 },
    });
    expect(slots).toEqual([]);
  });
});

describe("generateSlots — date overrides", () => {
  const base = {
    window: windowOf("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"),
    now: at("2026-09-01T00:00:00Z"),
    eventType: { durationMinutes: 60 },
  };

  it("replaces the weekly rules for that date only", () => {
    const slots = generateSlots({
      ...base,
      schedule: {
        ...nineToFive("UTC", [MON]),
        overrides: [{ date: "2026-09-07", intervals: [{ start: 13 * 60, end: 15 * 60 }] }],
      },
    });
    expect(utc(slots)).toEqual(["09-07 13:00Z", "09-07 14:00Z"]);
  });

  it("clears the day when the override has no intervals", () => {
    const slots = generateSlots({
      ...base,
      schedule: {
        ...nineToFive("UTC", [MON]),
        overrides: [{ date: "2026-09-07", intervals: [] }],
      },
    });
    expect(slots).toEqual([]);
  });

  it("leaves other dates on the weekly rules", () => {
    const slots = generateSlots({
      ...base,
      window: windowOf("2026-09-14T00:00:00Z", "2026-09-15T00:00:00Z"),
      schedule: {
        ...nineToFive("UTC", [MON]),
        overrides: [{ date: "2026-09-07", intervals: [] }],
      },
    });
    expect(utc(slots)).toHaveLength(8);
  });

  it("resolves override dates in the schedule's zone, not UTC", () => {
    // 2026-09-07 in Kolkata begins at 2026-09-06T18:30Z. Clearing that local
    // date must clear the whole local day, including its pre-midnight-UTC part.
    const slots = generateSlots({
      ...base,
      window: windowOf("2026-09-06T00:00:00Z", "2026-09-08T00:00:00Z"),
      schedule: {
        ...nineToFive("Asia/Kolkata", [MON]),
        overrides: [{ date: "2026-09-07", intervals: [] }],
      },
    });
    expect(slots).toEqual([]);
  });
});
