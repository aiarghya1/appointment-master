import { describe, expect, it } from "vitest";
import { contains, intersect, normalize, overlaps, pad, subtract, totalMinutes } from "./interval";
import type { Interval } from "./types";

/** Build an interval from `HH:MM`-ish hour offsets on a fixed arbitrary day. */
const BASE = Date.UTC(2026, 8, 1, 0, 0, 0);
const h = (hours: number, minutes = 0) => BASE + hours * 3_600_000 + minutes * 60_000;
const iv = (startH: number, endH: number): Interval => ({
  start: new Date(h(startH)),
  end: new Date(h(endH)),
});
const show = (list: Interval[]) =>
  list.map((i) => `${(i.start.getTime() - BASE) / 3_600_000}-${(i.end.getTime() - BASE) / 3_600_000}`);

describe("normalize", () => {
  it("sorts, merges overlaps, and drops empty ranges", () => {
    expect(show(normalize([iv(5, 7), iv(1, 3), iv(2, 4), iv(9, 9)]))).toEqual(["1-4", "5-7"]);
  });

  it("coalesces abutting ranges so no zero-width seam survives", () => {
    expect(show(normalize([iv(1, 2), iv(2, 3)]))).toEqual(["1-3"]);
  });

  it("discards inverted ranges rather than throwing", () => {
    expect(show(normalize([iv(4, 2), iv(1, 2)]))).toEqual(["1-2"]);
  });

  it("does not mutate its input", () => {
    const input = [iv(5, 7), iv(1, 3)];
    const snapshot = show(input);
    normalize(input);
    expect(show(input)).toEqual(snapshot);
  });
});

describe("subtract", () => {
  it("splits a range when a cut lands in its middle", () => {
    expect(show(subtract([iv(9, 17)], [iv(12, 13)]))).toEqual(["9-12", "13-17"]);
  });

  it("trims from either edge", () => {
    expect(show(subtract([iv(9, 17)], [iv(8, 10), iv(16, 18)]))).toEqual(["10-16"]);
  });

  it("removes a range entirely when fully covered", () => {
    expect(show(subtract([iv(9, 17)], [iv(8, 18)]))).toEqual([]);
  });

  it("ignores disjoint cuts", () => {
    expect(show(subtract([iv(9, 12)], [iv(13, 14)]))).toEqual(["9-12"]);
  });

  it("applies many cuts cumulatively", () => {
    expect(show(subtract([iv(9, 17)], [iv(10, 11), iv(12, 13), iv(15, 16)]))).toEqual([
      "9-10",
      "11-12",
      "13-15",
      "16-17",
    ]);
  });
});

describe("intersect", () => {
  it("keeps only the shared span", () => {
    expect(show(intersect([iv(9, 17)], [iv(12, 20)]))).toEqual(["12-17"]);
  });

  it("handles one range spanning several on the other side", () => {
    expect(show(intersect([iv(0, 24)], [iv(1, 2), iv(5, 6)]))).toEqual(["1-2", "5-6"]);
  });

  it("returns nothing for disjoint covers", () => {
    expect(show(intersect([iv(1, 2)], [iv(3, 4)]))).toEqual([]);
  });

  it("treats touching-but-not-overlapping as empty", () => {
    expect(show(intersect([iv(1, 2)], [iv(2, 3)]))).toEqual([]);
  });
});

describe("overlaps / contains", () => {
  it("is false for ranges that merely touch, since ranges are half-open", () => {
    expect(overlaps(iv(1, 2), iv(2, 3))).toBe(false);
  });

  it("is true for any shared instant", () => {
    expect(overlaps(iv(1, 3), iv(2, 4))).toBe(true);
  });

  it("recognises containment including exact edges", () => {
    expect(contains(iv(9, 17), iv(9, 17))).toBe(true);
    expect(contains(iv(9, 17), iv(10, 18))).toBe(false);
  });
});

describe("pad", () => {
  it("grows the range outward on both sides", () => {
    const padded = pad(iv(10, 11), 15, 30);
    expect(padded.start.getTime()).toBe(h(9, 45));
    expect(padded.end.getTime()).toBe(h(11, 30));
  });
});

describe("totalMinutes", () => {
  it("counts merged time once rather than double-counting overlaps", () => {
    expect(totalMinutes([iv(9, 12), iv(11, 13)])).toBe(240);
  });
});
