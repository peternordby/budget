import { describe, expect, it } from "vitest";
import {
  isMonthKey,
  keyToRef,
  parsePeriod,
  refToKey,
  serializePeriod,
} from "@/lib/period";

const FALLBACK = { year: 2026, month: 8 };

describe("isMonthKey", () => {
  it("accepts a well-formed key", () => {
    expect(isMonthKey("2026-08")).toBe(true);
  });

  it("rejects a month out of range", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
  });

  it("rejects the wrong shape", () => {
    expect(isMonthKey("2026-8")).toBe(false);
    expect(isMonthKey("202608")).toBe(false);
    expect(isMonthKey("")).toBe(false);
    expect(isMonthKey("abcd-ef")).toBe(false);
  });
});

describe("keyToRef / refToKey", () => {
  it("round-trips", () => {
    expect(refToKey(keyToRef("2026-03"))).toBe("2026-03");
  });

  it("pads single-digit months", () => {
    expect(refToKey({ year: 2026, month: 3 })).toBe("2026-03");
  });
});

describe("parsePeriod", () => {
  it("falls back when both params are missing", () => {
    const state = parsePeriod(null, null, FALLBACK);
    expect(state.selected).toEqual(["2026-08"]);
    expect(state.anchor).toEqual(FALLBACK);
  });

  it("reads a single selected month", () => {
    expect(parsePeriod("2026-05", null, FALLBACK).selected).toEqual(["2026-05"]);
  });

  it("reads several and sorts them ascending", () => {
    expect(parsePeriod("2026-07,2026-05,2026-06", null, FALLBACK).selected).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("drops duplicates", () => {
    expect(parsePeriod("2026-05,2026-05", null, FALLBACK).selected).toEqual(["2026-05"]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    expect(parsePeriod("2026-05,nonsense,2026-13,2026-06", null, FALLBACK).selected).toEqual([
      "2026-05",
      "2026-06",
    ]);
  });

  it("falls back when every entry is malformed", () => {
    expect(parsePeriod("nonsense,2026-13", null, FALLBACK).selected).toEqual(["2026-08"]);
  });

  it("falls back on an empty selection", () => {
    expect(parsePeriod("", null, FALLBACK).selected).toEqual(["2026-08"]);
    expect(parsePeriod(",,,", null, FALLBACK).selected).toEqual(["2026-08"]);
  });

  it("reads the anchor when valid", () => {
    expect(parsePeriod(null, "2026-02", FALLBACK).anchor).toEqual({ year: 2026, month: 2 });
  });

  it("falls the anchor back to the newest selected month when absent", () => {
    // A link with a selection but no anchor should show the chart where the
    // selection is, not wherever "today" happens to be.
    expect(parsePeriod("2025-03,2025-04", null, FALLBACK).anchor).toEqual({
      year: 2025,
      month: 4,
    });
  });

  it("falls the anchor back when malformed", () => {
    expect(parsePeriod("2025-03", "garbage", FALLBACK).anchor).toEqual({
      year: 2025,
      month: 3,
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePeriod(" 2026-05 , 2026-06 ", " 2026-06 ", FALLBACK).selected).toEqual([
      "2026-05",
      "2026-06",
    ]);
  });
});

describe("serializePeriod", () => {
  it("joins the selection with commas and emits the anchor", () => {
    expect(
      serializePeriod({ selected: ["2026-05", "2026-06"], anchor: { year: 2026, month: 6 } })
    ).toEqual({ p: "2026-05,2026-06", w: "2026-06" });
  });

  it("round-trips through parsePeriod", () => {
    const original = { selected: ["2025-11", "2025-12"], anchor: { year: 2026, month: 1 } };
    const { p, w } = serializePeriod(original);
    expect(parsePeriod(p, w, FALLBACK)).toEqual(original);
  });
});
