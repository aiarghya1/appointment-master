import type { Interval } from "@appointment-master/availability";
import { DateTime } from "luxon";

/**
 * Calendar helpers shared by the server and the browser.
 *
 * Every function takes an explicit zone. Nothing here consults the ambient
 * zone, because the server's zone and the viewer's zone are different by
 * definition and guessing between them is how times end up an hour out.
 */

export const ISO_DATE = "yyyy-MM-dd";
export const ISO_MONTH = "yyyy-MM";

/** The instant range covering a `YYYY-MM` month *as seen in `timeZone`*. */
export function monthWindow(month: string, timeZone: string): Interval {
  const start = DateTime.fromFormat(month, ISO_MONTH, { zone: timeZone }).startOf("month");
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
}

export function currentMonth(timeZone: string): string {
  return DateTime.now().setZone(timeZone).toFormat(ISO_MONTH);
}

export function shiftMonth(month: string, delta: number, timeZone: string): string {
  return DateTime.fromFormat(month, ISO_MONTH, { zone: timeZone })
    .plus({ months: delta })
    .toFormat(ISO_MONTH);
}

export function isValidMonth(month: string | undefined, timeZone: string): month is string {
  return !!month && DateTime.fromFormat(month, ISO_MONTH, { zone: timeZone }).isValid;
}

export function isValidZone(zone: string | undefined): zone is string {
  return !!zone && DateTime.local().setZone(zone).isValid;
}

/**
 * Buckets slots by the local date the viewer will see them on.
 *
 * The bucketing zone matters: a 22:00 slot in one zone is the following
 * morning in another, so grouping by anything other than the viewer's own
 * zone puts slots under the wrong day heading.
 */
export function groupByLocalDate(
  slots: readonly Interval[],
  timeZone: string,
): Map<string, Interval[]> {
  const grouped = new Map<string, Interval[]>();
  for (const slot of slots) {
    const key = DateTime.fromJSDate(slot.start, { zone: timeZone }).toFormat(ISO_DATE);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(slot);
    else grouped.set(key, [slot]);
  }
  return grouped;
}

/** Calendar grid for a month, padded to whole weeks starting Monday. */
export function monthGrid(month: string, timeZone: string): DateTime[] {
  const first = DateTime.fromFormat(month, ISO_MONTH, { zone: timeZone }).startOf("month");
  const start = first.minus({ days: first.weekday - 1 });
  const last = first.endOf("month");
  const end = last.plus({ days: 7 - last.weekday });

  const days: DateTime[] = [];
  for (let day = start; day <= end; day = day.plus({ days: 1 })) days.push(day);
  return days;
}

/**
 * `Asia/Kolkata` → `Asia/Kolkata (GMT+5:30)`, for the zone picker.
 *
 * The offset is formatted from the numeric value rather than via Luxon's
 * localized `ZZZZ` token. Node and browser ICU builds disagree on those names
 * — Node renders UTC+0 as `GMT` where Chrome renders `GMT+0` — and a label
 * that differs between server and client is a hydration mismatch.
 */
export function describeZone(zone: string, at = new Date()): string {
  const dt = DateTime.fromJSDate(at, { zone });
  if (!dt.isValid) return zone;

  const sign = dt.offset < 0 ? "-" : "+";
  const minutes = Math.abs(dt.offset);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const offset = mm === 0 ? `GMT${sign}${hh}` : `GMT${sign}${hh}:${String(mm).padStart(2, "0")}`;

  return `${zone.replace(/_/g, " ")} (${offset})`;
}

export function formatTime(instant: Date, timeZone: string, hour12: boolean): string {
  return DateTime.fromJSDate(instant, { zone: timeZone }).toFormat(hour12 ? "h:mm a" : "HH:mm");
}

export function formatLongDate(date: string, timeZone: string): string {
  return DateTime.fromFormat(date, ISO_DATE, { zone: timeZone }).toFormat("cccc, d LLLL yyyy");
}
