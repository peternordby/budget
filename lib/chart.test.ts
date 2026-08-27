import { describe, expect, it } from "vitest";
import { axisTicks, divergingTicks, shareWidths } from "./chart";

// axisTicks, shortAmount and labelledDates are covered in savings.test.ts,
// which has covered them since they lived in the /sparing chart.

describe("divergingTicks", () => {
  it("puts zero on a gridline", () => {
    expect(divergingTicks(9_000, 4_000).ticks).toContain(0);
  });

  it("uses one step for both sides, so a bar's height is its value", () => {
    const { ticks, top, bottom } = divergingTicks(10_000, 1_000);
    const steps = ticks.slice(1).map((tick, i) => tick - ticks[i]);
    expect(new Set(steps).size).toBe(1);
    expect(top).toBeGreaterThanOrEqual(10_000);
    expect(bottom).toBeLessThanOrEqual(-1_000);
  });

  it("gives a full plot to an all-surplus window", () => {
    const { bottom, ticks } = divergingTicks(5_000, 0);
    expect(bottom).toBe(0);
    expect(ticks[0]).toBe(0);
  });

  it("gives a full plot to an all-deficit window", () => {
    const { top, bottom } = divergingTicks(0, 5_000);
    expect(bottom).toBeLessThanOrEqual(-5_000);
    expect(top).toBeGreaterThan(0);
  });

  it("survives an empty window", () => {
    expect(divergingTicks(0, 0).ticks).toContain(0);
  });
});

describe("axisTicks rounding", () => {
  it("never emits the same gridline twice", () => {
    // A step below 1 krone rounds several intervals onto one integer.
    for (const max of [1, 2, 3, 4, 7, 9]) {
      const ticks = axisTicks(max);
      expect(new Set(ticks).size).toBe(ticks.length);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});

describe("shareWidths", () => {
  it("splits the full width proportionally", () => {
    const widths = shareWidths([50, 50], 200);
    expect(widths).toEqual([100, 100]);
  });

  it("still ends flush once a sliver has been widened", () => {
    const widths = shareWidths([1000, 1000, 1], 300);
    expect(widths[2]).toBe(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 6);
  });

  it("takes the pixels back from the segments that have room", () => {
    const widths = shareWidths([1000, 1000, 1], 300);
    expect(widths[0]).toBeLessThan(150);
    expect(widths[0]).toBeCloseTo(widths[1], 6);
  });

  it("falls back to equal shares when the minimum cannot fit", () => {
    expect(shareWidths([1, 1, 1, 1], 8, 3)).toEqual([2, 2, 2, 2]);
  });

  it("returns zeroes rather than NaN for an empty bar", () => {
    expect(shareWidths([0, 0], 200)).toEqual([0, 0]);
    expect(shareWidths([1, 1], 0)).toEqual([0, 0]);
  });
});
