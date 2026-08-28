import { DateTime } from "luxon";
import { interval, intersect, normalize } from "./interval.js";
import type { Interval, LocalInterval, Schedule } from "./types.js";

const MINUTES_PER_DAY = 1440;

export class InvalidTimeZoneError extends Error {
  constructor(zone: string) {
    super(`Unknown IANA time zone: ${zone}`);
    this.name = "InvalidTimeZoneError";
  }
}

/**
 * Resolve "N minutes after local midnight on `day`" into a real instant.
 *
 * We deliberately do NOT add a duration to midnight. Adding 540 minutes to
 * midnight gives the wrong answer on DST days — on a spring-forward date it
 * lands at 10:00, not the 09:00 the host meant. Instead we construct the
 * target wall-clock time directly and let Luxon apply that date's offset.
 *
 * Minutes at or beyond 1440 roll into subsequent calendar days, which is what
 * makes availability spanning midnight expressible.
 *
 * DST edge behaviour, inherited from Luxon and pinned by the test suite:
 *   - **Nonexistent** local times (inside a spring-forward gap) shift forward
 *     past the gap. 02:30 on a 02:00→03:00 morning becomes 03:30.
 *   - **Ambiguous** local times (repeated during fall-back) resolve to the
 *     first, pre-transition occurrence.
 */
function instantAt(day: DateTime, minutes: number): number {
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const withinDay = minutes - dayOffset * MINUTES_PER_DAY;
  return day
    .plus({ days: dayOffset }) // calendar-aware, so it survives DST days
    .set({
      hour: Math.floor(withinDay / 60),
      minute: withinDay % 60,
      second: 0,
      millisecond: 0,
    })
    .toMillis();
}

function localIntervalsFor(schedule: Schedule, day: DateTime): LocalInterval[] {
  const override = schedule.overrides?.find((o) => o.date === day.toISODate());
  // An override with zero intervals is meaningful: it clears the day. Only the
  // *absence* of an override falls through to the recurring weekly rules.
  if (override) return override.intervals;
  return schedule.rules.filter((r) => r.weekday === day.weekday);
}

/**
 * Project a schedule's recurring rules and date overrides onto a concrete
 * window of instants.
 *
 * The returned cover is normalized and clipped to `window`.
 */
export function expandSchedule(schedule: Schedule, window: Interval): Interval[] {
  const zone = schedule.timeZone;
  const probe = DateTime.fromMillis(0, { zone });
  if (!probe.isValid) throw new InvalidTimeZoneError(zone);

  // Widen by a day on each edge. A local day straddles the UTC window
  // boundaries, and overnight rules reach forward into the next date, so both
  // neighbours can contribute availability that lands inside the window.
  let day = DateTime.fromJSDate(window.start, { zone }).startOf("day").minus({ days: 1 });
  const lastDay = DateTime.fromJSDate(window.end, { zone }).startOf("day").plus({ days: 1 });

  const spans: Interval[] = [];
  while (day <= lastDay) {
    for (const local of localIntervalsFor(schedule, day)) {
      const start = instantAt(day, local.start);
      const end = instantAt(day, local.end);
      // A DST gap can collapse or invert a short window; drop rather than emit
      // a negative-length span.
      if (end > start) spans.push(interval(start, end));
    }
    day = day.plus({ days: 1 });
  }

  return intersect(normalize(spans), [window]);
}
