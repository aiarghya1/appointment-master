/**
 * Core vocabulary for the scheduling engine.
 *
 * Two kinds of time exist here and they must never be conflated:
 *
 *   - **Wall-clock time** (`MinuteOfDay`) — what a host means by "I work from
 *     9am". It is bound to an IANA zone and its UTC offset changes with DST.
 *     Host availability is *always* stored this way.
 *   - **Instants** (`Interval`, backed by `Date`) — absolute points on the
 *     timeline. Busy time, bookings, and generated slots are always instants.
 *
 * Storing availability as UTC or as a fixed offset is the single most common
 * way scheduling products break twice a year. We don't do it.
 */

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. Matches Luxon's `DateTime#weekday`. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Minutes elapsed since local midnight of the owning day.
 *
 * Values of 1440 and above roll into the following calendar day, which is how
 * availability that crosses midnight is expressed — a 22:00–02:00 night shift
 * is `{ start: 1320, end: 1560 }`. Legal range is 0 … 2880.
 */
export type MinuteOfDay = number;

/** A wall-clock range within (or spilling out of) a single local day. Half-open. */
export interface LocalInterval {
  start: MinuteOfDay;
  end: MinuteOfDay;
}

/** One recurring weekly working window, in the schedule's own zone. */
export interface WeeklyRule extends LocalInterval {
  weekday: Weekday;
}

/**
 * Replaces the weekly rules for one specific calendar date.
 *
 * An empty `intervals` array means "unavailable all day" — that is the
 * difference between having no override (fall back to the weekly rules) and
 * having an override that clears the day.
 */
export interface DateOverride {
  /** ISO calendar date `YYYY-MM-DD`, interpreted in the schedule's zone. */
  date: string;
  intervals: LocalInterval[];
}

export interface Schedule {
  /** IANA zone name, e.g. `Asia/Kolkata`. Never an offset, never an abbreviation. */
  timeZone: string;
  rules: WeeklyRule[];
  overrides?: DateOverride[];
}

/** A half-open range of instants, `[start, end)`. */
export interface Interval {
  start: Date;
  end: Date;
}
