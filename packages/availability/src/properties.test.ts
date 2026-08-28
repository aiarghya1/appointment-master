import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contains, normalize, overlaps, pad } from "./interval";
import { expandSchedule } from "./schedule";
import { generateSlots, type EventTypeConfig } from "./slots";
import type { Interval, Schedule, Weekday } from "./types";

/**
 * Invariants that must hold for *every* input, not just the cases we thought
 * to write down. Example-based tests catch the bugs we anticipated; these catch
 * the ones we didn't — which, in scheduling, is most of them.
 */

// A deliberately awkward spread: half-hour and three-quarter-hour offsets,
// both DST hemispheres, one zone with no DST at all, and Lord Howe's 30-minute
// DST shift, which breaks naive hour-based offset math.
const ZONES = [
  "UTC",
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
  "Asia/Tehran",
  "America/St_Johns",
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const arbSchedule = fc.record({
  timeZone: fc.constantFrom(...ZONES),
  rules: fc.array(
    fc
      .record({
        weekday: fc.constantFrom<Weekday>(...WEEKDAYS),
        start: fc.integer({ min: 0, max: 23 * 60 }),
        length: fc.integer({ min: 15, max: 10 * 60 }),
      })
      .map(({ weekday, start, length }) => ({ weekday, start, end: start + length })),
    { minLength: 0, maxLength: 8 },
  ),
});

const arbEventType: fc.Arbitrary<EventTypeConfig> = fc.record({
  durationMinutes: fc.constantFrom(15, 25, 30, 45, 60, 90),
  slotIntervalMinutes: fc.constantFrom(5, 15, 30, 60),
  beforeBufferMinutes: fc.constantFrom(0, 10, 15, 30),
  afterBufferMinutes: fc.constantFrom(0, 10, 15, 30),
  minimumNoticeMinutes: fc.constantFrom(0, 60, 120, 60 * 24),
  offsetMinutes: fc.constantFrom(0, 5),
});

/** A window somewhere in 2026 — the year containing our DST fixtures. */
const arbWindow: fc.Arbitrary<Interval> = fc
  .integer({ min: 0, max: 360 })
  .chain((dayOffset) =>
    fc.integer({ min: 1, max: 5 }).map((days) => {
      const start = Date.UTC(2026, 0, 1) + dayOffset * 86_400_000;
      return { start: new Date(start), end: new Date(start + days * 86_400_000) };
    }),
  );

const arbBusy = (window: Interval) =>
  fc.array(
    fc
      .record({
        offsetMinutes: fc.integer({
          min: 0,
          max: Math.floor((window.end.getTime() - window.start.getTime()) / 60_000),
        }),
        lengthMinutes: fc.integer({ min: 15, max: 240 }),
      })
      .map(({ offsetMinutes, lengthMinutes }) => ({
        start: new Date(window.start.getTime() + offsetMinutes * 60_000),
        end: new Date(window.start.getTime() + (offsetMinutes + lengthMinutes) * 60_000),
      })),
    { maxLength: 10 },
  );

const arbCase = fc
  .tuple(arbSchedule, arbEventType, arbWindow)
  .chain(([schedule, eventType, window]) =>
    arbBusy(window).map((busy) => ({ schedule, eventType, window, busy })),
  );

describe("generateSlots invariants", () => {
  it("never offers a slot outside the host's availability", () => {
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const now = window.start;
        const slots = generateSlots({ window, now, schedule, eventType, busy });
        const available = expandSchedule(schedule as Schedule, window);
        for (const slot of slots) {
          expect(available.some((span) => contains(span, slot))).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never offers a slot whose buffered guard band touches busy time", () => {
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const now = window.start;
        const slots = generateSlots({ window, now, schedule, eventType, busy });
        const blocked = normalize(busy);
        for (const slot of slots) {
          const guard = pad(
            slot,
            eventType.beforeBufferMinutes ?? 0,
            eventType.afterBufferMinutes ?? 0,
          );
          expect(blocked.some((b) => overlaps(guard, b))).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("returns slots in ascending order, each exactly the event duration", () => {
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const slots = generateSlots({ window, now: window.start, schedule, eventType, busy });
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]!;
          expect(slot.end.getTime() - slot.start.getTime()).toBe(
            eventType.durationMinutes * 60_000,
          );
          if (i > 0) expect(slot.start.getTime()).toBeGreaterThan(slots[i - 1]!.start.getTime());
        }
      }),
      { numRuns: 300 },
    );
  });

  it("honours minimum notice for every slot", () => {
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const now = window.start;
        const slots = generateSlots({ window, now, schedule, eventType, busy });
        const earliest = now.getTime() + (eventType.minimumNoticeMinutes ?? 0) * 60_000;
        for (const slot of slots) {
          expect(slot.start.getTime()).toBeGreaterThanOrEqual(earliest);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic — identical inputs always give identical output", () => {
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const args = { window, now: window.start, schedule, eventType, busy } as const;
        expect(generateSlots(args).map((s) => s.start.toISOString())).toEqual(
          generateSlots(args).map((s) => s.start.toISOString()),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("is window-independent — narrowing the query filters, never re-anchors", () => {
    // The invariant that the booking flow depends on: re-checking a single slot
    // by querying just its own window must return that slot. Violating it made
    // valid bookings fail as phantom conflicts.
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const base = { now: window.start, schedule, eventType, busy } as const;
        const wide = generateSlots({ ...base, window });

        for (const slot of wide.slice(0, 12)) {
          const exact = generateSlots({ ...base, window: { start: slot.start, end: slot.end } });
          expect(exact.map((s) => s.start.toISOString())).toContain(slot.start.toISOString());
        }
      }),
      { numRuns: 200 },
    );
  });

  it("only ever loses slots when busy time is added", () => {
    // Monotonicity: adding a commitment can remove availability but must never
    // conjure a slot that wasn't offered when the host was free.
    fc.assert(
      fc.property(arbCase, ({ schedule, eventType, window, busy }) => {
        const base = { window, now: window.start, schedule, eventType } as const;
        const free = new Set(
          generateSlots(base).map((s) => s.start.toISOString()),
        );
        for (const slot of generateSlots({ ...base, busy })) {
          expect(free.has(slot.start.toISOString())).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
