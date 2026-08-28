import type { Interval } from "./types.js";

/**
 * Set algebra over half-open instant ranges.
 *
 * Everything here is total, allocation-light, and free of date-library calls —
 * these operate on epoch milliseconds only. Timezone reasoning happens strictly
 * upstream in `schedule.ts`; by the time intervals reach this module they are
 * absolute and zone-agnostic.
 */

const at = (d: Date) => d.getTime();
const MINUTE_MS = 60_000;

export function interval(startMs: number, endMs: number): Interval {
  return { start: new Date(startMs), end: new Date(endMs) };
}

/**
 * Sort by start, discard empty/inverted ranges, and merge anything that
 * overlaps or merely touches. The result is a canonical, disjoint, ascending
 * cover — every other function here assumes its inputs went through this.
 */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .map((i) => [at(i.start), at(i.end)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    // `s <= last[1]` rather than `<` so abutting ranges coalesce; leaving a
    // zero-width seam would let a slot "fit" in a gap of no duration.
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([s, e]) => interval(s, e));
}

export function overlaps(a: Interval, b: Interval): boolean {
  return at(a.start) < at(b.end) && at(b.start) < at(a.end);
}

export function contains(outer: Interval, inner: Interval): boolean {
  return at(outer.start) <= at(inner.start) && at(inner.end) <= at(outer.end);
}

export function durationMinutes(i: Interval): number {
  return (at(i.end) - at(i.start)) / MINUTE_MS;
}

/** `base \ cuts`, normalized. Used to carve busy time out of working hours. */
export function subtract(base: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  let remaining = normalize(base);
  for (const cut of normalize(cuts)) {
    const cs = at(cut.start);
    const ce = at(cut.end);
    const next: Interval[] = [];
    for (const piece of remaining) {
      const ps = at(piece.start);
      const pe = at(piece.end);
      if (ce <= ps || cs >= pe) {
        next.push(piece); // disjoint — survives untouched
        continue;
      }
      if (cs > ps) next.push(interval(ps, cs)); // remainder to the left
      if (ce < pe) next.push(interval(ce, pe)); // remainder to the right
    }
    remaining = next;
  }
  return remaining;
}

/** `a ∩ b`, normalized. Linear merge over two sorted covers. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const left = normalize(a);
  const right = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const l = left[i]!;
    const r = right[j]!;
    const start = Math.max(at(l.start), at(r.start));
    const end = Math.min(at(l.end), at(r.end));
    if (end > start) out.push(interval(start, end));
    if (at(l.end) < at(r.end)) i++;
    else j++;
  }
  return out;
}

/**
 * Grow an interval outward by a number of minutes on each side.
 *
 * This is how buffers are enforced: rather than shrinking availability, we
 * widen the *candidate* booking into a guard band and reject it if the band
 * touches anything busy. That keeps buffers out of the stored schedule, so
 * changing a buffer never rewrites availability data.
 */
export function pad(i: Interval, beforeMinutes: number, afterMinutes: number): Interval {
  return interval(at(i.start) - beforeMinutes * MINUTE_MS, at(i.end) + afterMinutes * MINUTE_MS);
}

export function totalMinutes(intervals: readonly Interval[]): number {
  return normalize(intervals).reduce((sum, i) => sum + durationMinutes(i), 0);
}
