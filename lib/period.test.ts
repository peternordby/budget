import { describe, expect, it } from "vitest";
import {
  isMonthKey,
  keyToRef,
  WINDOW_AFTER,
  WINDOW_BEFORE,
  WINDOW_LENGTH,
  chartWindow,
  parsePeriod,
  monthRangeLabel,
  periodLabel,
  refToKey,
  windowLabel,
  yearAnchor,
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

describe("periodLabel", () => {
  it("names a single month", () => {
    expect(periodLabel([{ year: 2026, month: 3 }])).toBe("mars 2026");
  });

  it("names a whole year by the year alone", () => {
    const all = Array.from({ length: 12 }, (_, i) => ({ year: 2026, month: i + 1 }));
    expect(periodLabel(all)).toBe("2026");
  });

  it("counts months inside one year", () => {
    expect(
      periodLabel([
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
      ])
    ).toBe("3 måneder 2026");
  });

  it("drops the year when the selection spans more than one", () => {
    expect(
      periodLabel([
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
      ])
    ).toBe("2 måneder valgt");
  });

  it("says so when nothing is selected", () => {
    expect(periodLabel([])).toBe("Ingen periode");
  });
});

describe("chartWindow", () => {
  it("reaches WINDOW_BEFORE months back and WINDOW_AFTER months forward", () => {
    const months = chartWindow({ year: 2026, month: 8 });
    expect(months).toHaveLength(WINDOW_LENGTH);
    expect(months[WINDOW_BEFORE]).toEqual({ year: 2026, month: 8 });
    expect(months[0]).toEqual({ year: 2025, month: 12 });
    expect(months[months.length - 1]).toEqual({ year: 2026, month: 11 });
  });

  it("crosses the year boundary in both directions", () => {
    const months = chartWindow({ year: 2026, month: 1 });
    expect(months[0]).toEqual({ year: 2025, month: 5 });
    expect(months[months.length - 1]).toEqual({ year: 2026, month: 4 });
  });

  it("is oldest first, with no gaps", () => {
    const months = chartWindow({ year: 2026, month: 8 });
    for (let i = 1; i < months.length; i += 1) {
      const previous = months[i - 1];
      const expected =
        previous.month === 12
          ? { year: previous.year + 1, month: 1 }
          : { year: previous.year, month: previous.month + 1 };
      expect(months[i]).toEqual(expected);
    }
  });
});

describe("yearAnchor", () => {
  it("puts a whole year exactly inside the window", () => {
    // The reason it exists: with a window that overhangs its anchor, anchoring a
    // year selection at December would draw April–March.
    const months = chartWindow(yearAnchor(2026));
    expect(months[0]).toEqual({ year: 2026, month: 1 });
    expect(months[months.length - 1]).toEqual({ year: 2026, month: 12 });
    expect(months.every((ref) => ref.year === 2026)).toBe(true);
  });

  it("stays consistent with the window constants", () => {
    expect(yearAnchor(2026)).toEqual({ year: 2026, month: 12 - WINDOW_AFTER });
  });
});

const monthList = (pairs: [number, number][]) =>
  pairs.map(([year, month]) => ({ year, month }));

describe("windowLabel", () => {
  it("states the real month count, not the caller's constant", () => {
    // useAnalysisWindow clamps to the fetched range, so seven months of a
    // twelve-month request must not be labelled "Siste 12 måneder".
    const seven = monthList(
      Array.from({ length: 7 }, (_, i): [number, number] => [2026, i + 2])
    );
    expect(windowLabel(seven)).toBe("Siste 7 måneder · feb–aug 2026");
  });

  it("names the year once inside a year, twice across one", () => {
    expect(monthRangeLabel(monthList([[2026, 1], [2026, 12]]))).toBe("jan–des 2026");
    expect(monthRangeLabel(monthList([[2025, 9], [2026, 8]]))).toBe("sep 2025–aug 2026");
  });

  it("collapses a single month and survives an empty window", () => {
    expect(monthRangeLabel(monthList([[2026, 5]]))).toBe("mai 2026");
    expect(windowLabel([])).toBe("");
  });
});
