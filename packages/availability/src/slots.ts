import { interval, normalize, overlaps, pad } from "./interval";
import { expandSchedule } from "./schedule";
import type { Interval, Schedule } from "./types";

const MINUTE_MS = 60_000;

export interface EventTypeConfig {
  /** Length of the meeting itself, excluding buffers. */
  durationMinutes: number;
  /** Spacing between candidate start times. Defaults to `durationMinutes`. */
  slotIntervalMinutes?: number;
  /** Protected time immediately before a booking. */
  beforeBufferMinutes?: number;
  /** Protected time immediately after a booking. */
  afterBufferMinutes?: number;
  /** How far ahead of `now` the earliest bookable slot must be. */
  minimumNoticeMinutes?: number;
  /**
   * Shifts every candidate start within its window, so a 9:00–17:00 day with
   * `offsetMinutes: 5` yields 9:05, 9:35, … Useful for hosts who want a few
   * minutes to breathe on the hour.
   */
  offsetMinutes?: number;
}

export interface SlotQuery {
  /** The span of instants to return slots for. */
  window: Interval;
  /** Injected rather than read from the clock, so results are reproducible. */
  now: Date;
  schedule: Schedule;
  eventType: EventTypeConfig;
  /**
   * Everything the host is already committed to — confirmed bookings plus
   * external calendar busy time. Need not be sorted or disjoint.
   */
  busy?: readonly Interval[];
}

/**
 * The scheduling engine's single entry point.
 *
 * Pure: no clock, no ambient zone, no I/O. Given identical inputs it returns
 * identical output forever, which is what makes DST behaviour testable instead
 * of merely hopeful.
 *
 * Slots are anchored to the start of each availability window (plus any
 * configured offset), not to the top of the hour — so a host whose day begins
 * at 09:20 gets 09:20, 09:50, … rather than losing the first 40 minutes.
 */
export function generateSlots(query: SlotQuery): Interval[] {
  const { window, now, schedule, eventType, busy = [] } = query;

  const duration = eventType.durationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError(`durationMinutes must be a positive number, got ${duration}`);
  }
  const step = eventType.slotIntervalMinutes ?? duration;
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`slotIntervalMinutes must be a positive number, got ${step}`);
  }

  const before = eventType.beforeBufferMinutes ?? 0;
  const after = eventType.afterBufferMinutes ?? 0;
  const offset = eventType.offsetMinutes ?? 0;
  const notice = eventType.minimumNoticeMinutes ?? 0;

  // Nothing before this instant is bookable, whatever the schedule says.
  const windowEnd = window.end.getTime();
  const earliest = Math.max(window.start.getTime(), now.getTime() + notice * MINUTE_MS);

  const available = expandSchedule(schedule, window);
  const blocked = normalize(busy);

  const slots: Interval[] = [];
  // Monotonic cursor into `blocked`. Guard-band starts are non-decreasing
  // across the whole scan, so a busy range we have passed can never become
  // relevant again — this keeps the sweep linear rather than quadratic.
  let b = 0;

  for (const span of available) {
    const spanEnd = span.end.getTime();
    let start = span.start.getTime() + offset * MINUTE_MS;

    // Jump the cursor forward instead of stepping through slots that minimum
    // notice would reject anyway.
    if (start < earliest) {
      const behindBy = earliest - start;
      start += Math.ceil(behindBy / (step * MINUTE_MS)) * step * MINUTE_MS;
    }

    for (; start + duration * MINUTE_MS <= spanEnd; start += step * MINUTE_MS) {
      // Spans are not trimmed to the window, so the window is enforced here.
      // Anchoring stays tied to the span; only which slots survive depends on
      // the query, which is what keeps narrowing a window a pure filter.
      if (start + duration * MINUTE_MS > windowEnd) break;

      const candidate = interval(start, start + duration * MINUTE_MS);
      const guard = pad(candidate, before, after);

      while (b < blocked.length && blocked[b]!.end.getTime() <= guard.start.getTime()) b++;

      if (b < blocked.length && overlaps(guard, blocked[b]!)) continue;
      slots.push(candidate);
    }
  }

  return slots;
}
