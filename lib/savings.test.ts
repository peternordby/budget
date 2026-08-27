import { describe, expect, it } from "vitest";
import {
  bandSegments,
  bandShapes,
  datePositions,
  dayNumber,
  defaultOrder,
  holdings,
  parseAmountCell,
  parseDateCell,
  parseSnapshotCsv,
  reconcileOrder,
  stackedSeries,
  totalNow,
  totalSeries,
  type Snapshot,
} from "./savings";
import { axisTicks, labelledDates, shortAmount } from "./chart";

let nextId = 1;
function snap(category: string, date: string, amount: number): Snapshot {
  return { id: nextId++, category, date, amount };
}

describe("holdings", () => {
  it("returns nothing for no snapshots", () => {
    expect(holdings([])).toEqual([]);
  });

  it("uses the newest snapshot per category and compares to the one before", () => {
    const result = holdings([
      snap("Fond", "2026-07-01", 100_000),
      snap("Fond", "2026-08-01", 118_000),
      snap("BSU", "2026-08-01", 45_000),
    ]);

    const fond = result.find((h) => h.category === "Fond")!;
    expect(fond.amount).toBe(118_000);
    expect(fond.date).toBe("2026-08-01");
    expect(fond.previousAmount).toBe(100_000);
    expect(fond.change).toBe(18_000);
    expect(fond.history.map((h) => h.date)).toEqual([
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("reports no change for a category with a single snapshot", () => {
    const [only] = holdings([snap("BSU", "2026-08-01", 45_000)]);
    expect(only.previousAmount).toBeNull();
    expect(only.previousDate).toBeNull();
    expect(only.change).toBeNull();
  });

  it("sorts largest holding first", () => {
    const result = holdings([
      snap("BSU", "2026-08-01", 45_000),
      snap("Fond", "2026-08-01", 118_000),
      snap("Bufferkonto", "2026-08-01", 60_000),
    ]);
    expect(result.map((h) => h.category)).toEqual([
      "Fond",
      "Bufferkonto",
      "BSU",
    ]);
  });

  it("is insensitive to input order", () => {
    const forward = holdings([
      snap("Fond", "2026-06-01", 90_000),
      snap("Fond", "2026-08-01", 118_000),
    ]);
    const reversed = holdings([
      snap("Fond", "2026-08-01", 118_000),
      snap("Fond", "2026-06-01", 90_000),
    ]);
    expect(forward[0].amount).toBe(reversed[0].amount);
    expect(forward[0].change).toBe(reversed[0].change);
  });

  it("counts a zero balance as a real observation, not a missing one", () => {
    const [only] = holdings([
      snap("Aksjesparekonto", "2026-01-01", 12_000),
      snap("Aksjesparekonto", "2026-08-01", 0),
    ]);
    expect(only.amount).toBe(0);
    expect(only.change).toBe(-12_000);
  });
});

describe("totalNow", () => {
  it("sums the newest snapshot of every category", () => {
    expect(
      totalNow([
        snap("Fond", "2026-07-01", 100_000),
        snap("Fond", "2026-08-01", 118_000),
        snap("BSU", "2026-08-01", 45_000),
      ])
    ).toBe(163_000);
  });

  it("is zero with no snapshots", () => {
    expect(totalNow([])).toBe(0);
  });
});

describe("totalSeries", () => {
  it("returns nothing for no snapshots", () => {
    expect(totalSeries([])).toEqual([]);
  });

  it("carries a category forward on dates it was not observed", () => {
    // BSU is only snapshotted in June; the July and August points must still
    // include it rather than dropping to Fond alone.
    const series = totalSeries([
      snap("Fond", "2026-06-01", 100_000),
      snap("BSU", "2026-06-01", 40_000),
      snap("Fond", "2026-07-01", 110_000),
      snap("Fond", "2026-08-01", 118_000),
    ]);

    expect(series).toEqual([
      { date: "2026-06-01", total: 140_000 },
      { date: "2026-07-01", total: 150_000 },
      { date: "2026-08-01", total: 158_000 },
    ]);
  });

  it("does not back-fill a category before its first snapshot", () => {
    const series = totalSeries([
      snap("Fond", "2026-06-01", 100_000),
      snap("BSU", "2026-08-01", 45_000),
    ]);
    expect(series).toEqual([
      { date: "2026-06-01", total: 100_000 },
      { date: "2026-08-01", total: 145_000 },
    ]);
  });

  it("emits one point per date when several categories share it", () => {
    const series = totalSeries([
      snap("Fond", "2026-08-01", 118_000),
      snap("BSU", "2026-08-01", 45_000),
    ]);
    expect(series).toEqual([{ date: "2026-08-01", total: 163_000 }]);
  });

  it("is insensitive to input order", () => {
    const rows = [
      snap("Fond", "2026-07-01", 110_000),
      snap("BSU", "2026-06-01", 40_000),
      snap("Fond", "2026-06-01", 100_000),
    ];
    const forward = totalSeries(rows);
    const reversed = totalSeries([...rows].reverse());
    expect(forward).toEqual(reversed);
  });
});

describe("parseDateCell", () => {
  it("accepts ISO dates as-is", () => {
    expect(parseDateCell("2026-08-22")).toBe("2026-08-22");
    expect(parseDateCell("2026-8-2")).toBe("2026-08-02");
  });

  it("reads Norwegian dotted dates as day-first", () => {
    expect(parseDateCell("22.08.2026")).toBe("2026-08-22");
    expect(parseDateCell("1.2.2026")).toBe("2026-02-01");
  });

  it("reads slashed dates as day-first", () => {
    expect(parseDateCell("22/08/2026")).toBe("2026-08-22");
  });

  it("treats a two-digit year as this century", () => {
    expect(parseDateCell("22.08.26")).toBe("2026-08-22");
  });

  it("rejects a day the month does not have instead of rolling over", () => {
    expect(parseDateCell("31.02.2026")).toBeNull();
    expect(parseDateCell("2026-02-30")).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseDateCell("29.02.2024")).toBe("2024-02-29");
  });

  it("rejects junk and blanks", () => {
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("   ")).toBeNull();
    expect(parseDateCell("Fond")).toBeNull();
    expect(parseDateCell("2026-13-01")).toBeNull();
  });
});

describe("parseAmountCell", () => {
  it("reads plain integers", () => {
    expect(parseAmountCell("45000")).toBe(45_000);
  });

  it("strips spaced thousands separators and currency labels", () => {
    expect(parseAmountCell("124 500 kr")).toBe(124_500);
    expect(parseAmountCell("124 500")).toBe(124_500);
    expect(parseAmountCell("1'234")).toBe(1_234);
    expect(parseAmountCell("500,-")).toBe(500);
  });

  it("rounds a Norwegian decimal comma", () => {
    expect(parseAmountCell("1234,50")).toBe(1_235);
    expect(parseAmountCell("1234,49")).toBe(1_234);
  });

  it("treats a lone comma with three trailing digits as a thousands separator", () => {
    expect(parseAmountCell("1,234")).toBe(1_234);
  });

  it("handles both separators together, either way round", () => {
    expect(parseAmountCell("1.234,50")).toBe(1_235);
    expect(parseAmountCell("1,234.50")).toBe(1_235);
  });

  it("treats a lone period with three trailing digits as a thousands separator", () => {
    expect(parseAmountCell("124.500")).toBe(124_500);
  });

  it("reads parenthesised values as negative", () => {
    expect(parseAmountCell("(500)")).toBe(-500);
  });

  it("rejects junk and blanks", () => {
    expect(parseAmountCell("")).toBeNull();
    expect(parseAmountCell("  ")).toBeNull();
    expect(parseAmountCell("n/a")).toBeNull();
  });
});

describe("parseSnapshotCsv", () => {
  it("reads the long layout", () => {
    const result = parseSnapshotCsv(
      "dato;kategori;beløp\n2026-08-01;Fond;118000\n2026-08-01;BSU;45000\n"
    );
    expect(result.layout).toBe("long");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { category: "Fond", date: "2026-08-01", amount: 118_000 },
      { category: "BSU", date: "2026-08-01", amount: 45_000 },
    ]);
  });

  it("reads English long headers and comma delimiters", () => {
    const result = parseSnapshotCsv(
      "date,account,balance\n2026-08-01,Fond,118000\n"
    );
    expect(result.layout).toBe("long");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].category).toBe("Fond");
  });

  it("reads the wide layout, one column per category", () => {
    const result = parseSnapshotCsv(
      "dato;Fond;BSU\n01.06.2026;100000;40000\n01.08.2026;118000;45000\n"
    );
    expect(result.layout).toBe("wide");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { category: "Fond", date: "2026-06-01", amount: 100_000 },
      { category: "BSU", date: "2026-06-01", amount: 40_000 },
      { category: "Fond", date: "2026-08-01", amount: 118_000 },
      { category: "BSU", date: "2026-08-01", amount: 45_000 },
    ]);
  });

  it("skips blank cells in the wide layout rather than recording a zero", () => {
    const result = parseSnapshotCsv(
      "dato;Fond;BSU\n01.06.2026;100000;\n01.08.2026;;45000\n"
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { category: "Fond", date: "2026-06-01", amount: 100_000 },
      { category: "BSU", date: "2026-08-01", amount: 45_000 },
    ]);
  });

  it("keeps an explicit zero in the wide layout", () => {
    const result = parseSnapshotCsv("dato;Fond\n01.08.2026;0\n");
    expect(result.rows).toEqual([
      { category: "Fond", date: "2026-08-01", amount: 0 },
    ]);
  });

  it("reports the line number of a bad date and keeps the good rows", () => {
    const result = parseSnapshotCsv(
      "dato;kategori;beløp\n2026-08-01;Fond;118000\nikke-en-dato;BSU;45000\n"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Linje 3");
  });

  it("reports a bad amount without dropping the rest of a wide row", () => {
    const result = parseSnapshotCsv("dato;Fond;BSU\n01.08.2026;n/a;45000\n");
    expect(result.rows).toEqual([
      { category: "BSU", date: "2026-08-01", amount: 45_000 },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Fond");
  });

  it("rejects a negative balance", () => {
    const result = parseSnapshotCsv("dato;kategori;beløp\n2026-08-01;Fond;-5\n");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("lets the last row win for a repeated category and date", () => {
    const result = parseSnapshotCsv(
      "dato;kategori;beløp\n2026-08-01;Fond;100000\n2026-08-01;Fond;118000\n"
    );
    expect(result.rows).toEqual([
      { category: "Fond", date: "2026-08-01", amount: 118_000 },
    ]);
  });

  it("ignores blank lines and a trailing newline", () => {
    const result = parseSnapshotCsv(
      "dato;kategori;beløp\n2026-08-01;Fond;118000\n\n\n"
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it("handles a BOM, CRLF, and quoted category names", () => {
    const result = parseSnapshotCsv(
      '﻿dato;kategori;beløp\r\n2026-08-01;"Fond, globalt";118000\r\n'
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0].category).toBe("Fond, globalt");
  });

  it("explains itself when the header names no categories", () => {
    const result = parseSnapshotCsv("kolonne\nnoe\n");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports an empty file", () => {
    expect(parseSnapshotCsv("").errors).toEqual(["Filen er tom."]);
  });
});

describe("dayNumber", () => {
  it("counts days from the epoch", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
  });

  it("does not shift a date across a timezone boundary", () => {
    // 1 Jan parsed via Date.UTC stays 1 Jan regardless of the host offset.
    expect(dayNumber("2026-01-02") - dayNumber("2026-01-01")).toBe(1);
  });

  it("spans a leap day correctly", () => {
    expect(dayNumber("2024-03-01") - dayNumber("2024-02-28")).toBe(2);
  });
});

describe("datePositions", () => {
  it("places a single date at 0", () => {
    expect(datePositions(["2026-08-01"])).toEqual([0]);
  });

  it("spaces dates proportionally to elapsed time, not evenly", () => {
    // Two days apart, then 98 more: the middle point must sit near the left.
    const positions = datePositions([
      "2026-01-01",
      "2026-01-03",
      "2026-04-11",
    ]);
    expect(positions[0]).toBe(0);
    expect(positions[2]).toBe(1);
    expect(positions[1]).toBeCloseTo(2 / 100, 5);
  });

  it("collapses several dates on the same day to 0", () => {
    expect(datePositions(["2026-08-01", "2026-08-01"])).toEqual([0, 0]);
  });

  it("returns nothing for no dates", () => {
    expect(datePositions([])).toEqual([]);
  });
});

describe("defaultOrder / reconcileOrder", () => {
  const rows = [
    snap("Fond", "2026-08-01", 118_000),
    snap("BSU", "2026-08-01", 45_000),
    snap("Buffer", "2026-08-01", 60_000),
  ];

  it("orders by current size, largest first", () => {
    expect(defaultOrder(rows)).toEqual(["Fond", "Buffer", "BSU"]);
  });

  it("keeps a saved order that still matches the data", () => {
    expect(reconcileOrder(["BSU", "Fond", "Buffer"], rows)).toEqual([
      "BSU",
      "Fond",
      "Buffer",
    ]);
  });

  it("drops a saved name whose category no longer exists", () => {
    expect(reconcileOrder(["Slettet", "BSU"], rows)).toEqual([
      "BSU",
      "Fond",
      "Buffer",
    ]);
  });

  it("appends categories the saved order has never seen", () => {
    // An import adding Buffer must not leave it invisible.
    expect(reconcileOrder(["BSU", "Fond"], rows)).toEqual([
      "BSU",
      "Fond",
      "Buffer",
    ]);
  });

  it("falls back to the default order when nothing is saved", () => {
    expect(reconcileOrder([], rows)).toEqual(defaultOrder(rows));
  });
});

describe("stackedSeries", () => {
  it("returns an empty chart for no snapshots", () => {
    expect(stackedSeries([])).toEqual({
      dates: [],
      bands: [],
      totals: [],
      max: 0,
    });
  });

  it("stacks bands bottom-first in the given order", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-08-01", 100_000),
        snap("BSU", "2026-08-01", 40_000),
      ],
      ["BSU", "Fond"]
    );
    expect(chart.bands.map((b) => b.category)).toEqual(["BSU", "Fond"]);
    expect(chart.bands[0].lower).toEqual([0]);
    expect(chart.bands[0].upper).toEqual([40_000]);
    expect(chart.bands[1].lower).toEqual([40_000]);
    expect(chart.bands[1].upper).toEqual([140_000]);
    expect(chart.totals).toEqual([140_000]);
  });

  it("reordering changes the baselines but not the total", () => {
    const rows = [
      snap("Fond", "2026-08-01", 100_000),
      snap("BSU", "2026-08-01", 40_000),
    ];
    const a = stackedSeries(rows, ["BSU", "Fond"]);
    const b = stackedSeries(rows, ["Fond", "BSU"]);
    expect(a.totals).toEqual(b.totals);
    expect(a.bands[0].lower).toEqual([0]);
    expect(b.bands[0].lower).toEqual([0]);
    expect(b.bands[1].lower).toEqual([100_000]);
  });

  it("carries a value forward across dates the category was not observed", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("BSU", "2026-06-01", 40_000),
        snap("Fond", "2026-07-01", 110_000),
      ],
      ["BSU", "Fond"]
    );
    // BSU has no July snapshot but still holds 40 000.
    expect(chart.bands[0].values).toEqual([40_000, 40_000]);
    expect(chart.totals).toEqual([140_000, 150_000]);
  });

  it("leaves null before a category's first snapshot and draws no band there", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("BSU", "2026-08-01", 45_000),
      ],
      ["Fond", "BSU"]
    );
    const bsu = chart.bands[1];
    expect(bsu.values).toEqual([null, 45_000]);
    expect(bsu.lower).toEqual([null, 100_000]);
    expect(bsu.upper).toEqual([null, 145_000]);
    expect(bsu.firstIndex).toBe(1);
    // The band below keeps its baseline where BSU is absent.
    expect(chart.bands[0].lower).toEqual([0, 0]);
    expect(chart.totals).toEqual([100_000, 145_000]);
  });

  it("gives a late-starting band at the bottom of the stack no height early on", () => {
    // Ordering a not-yet-existing category first must not lift the others.
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("BSU", "2026-08-01", 45_000),
      ],
      ["BSU", "Fond"]
    );
    expect(chart.bands[0].values).toEqual([null, 45_000]);
    expect(chart.bands[1].lower).toEqual([0, 45_000]);
    expect(chart.totals).toEqual([100_000, 145_000]);
  });

  it("treats a retired category recorded as 0 as taking no height", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("BSU", "2026-06-01", 40_000),
        snap("BSU", "2026-07-01", 0),
        snap("Fond", "2026-08-01", 110_000),
      ],
      ["BSU", "Fond"]
    );
    // 0 carries forward, so BSU contributes nothing from July onward.
    expect(chart.bands[0].values).toEqual([40_000, 0, 0]);
    expect(chart.bands[0].lower).toEqual([0, 0, 0]);
    expect(chart.bands[0].upper).toEqual([40_000, 0, 0]);
    expect(chart.totals).toEqual([140_000, 100_000, 110_000]);
  });

  it("flags a category not observed on the newest date as stale", () => {
    const chart = stackedSeries(
      [
        snap("BSU", "2026-06-01", 40_000),
        snap("Fond", "2026-08-01", 100_000),
      ],
      ["Fond", "BSU"]
    );
    const fond = chart.bands.find((b) => b.category === "Fond")!;
    const bsu = chart.bands.find((b) => b.category === "BSU")!;
    expect(fond.stale).toBe(false);
    expect(bsu.stale).toBe(true);
    expect(bsu.lastObserved).toBe("2026-06-01");
  });

  it("agrees with totalSeries on the same input", () => {
    const rows = [
      snap("Fond", "2026-06-01", 100_000),
      snap("BSU", "2026-06-01", 40_000),
      snap("Fond", "2026-07-01", 110_000),
      snap("Aksje", "2026-08-01", 20_000),
    ];
    expect(stackedSeries(rows).totals).toEqual(
      totalSeries(rows).map((point) => point.total)
    );
  });

  it("ignores a name in the order that has no snapshots", () => {
    const chart = stackedSeries([snap("Fond", "2026-08-01", 100_000)], [
      "Spøkelse",
      "Fond",
    ]);
    expect(chart.bands.map((b) => b.category)).toEqual(["Fond"]);
  });

  it("includes a category the order forgot", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-08-01", 100_000),
        snap("BSU", "2026-08-01", 40_000),
      ],
      ["Fond"]
    );
    expect(chart.bands.map((b) => b.category)).toEqual(["Fond", "BSU"]);
    expect(chart.totals).toEqual([140_000]);
  });

  it("never reports a max below 1, so a chart of only zeroes still scales", () => {
    expect(stackedSeries([snap("Fond", "2026-08-01", 0)]).max).toBe(1);
  });
});

describe("bandSegments", () => {
  const chartOf = (rows: Snapshot[], order?: string[]) =>
    stackedSeries(rows, order);

  it("returns one run for a band present throughout", () => {
    const chart = chartOf([
      snap("Fond", "2026-06-01", 100_000),
      snap("Fond", "2026-07-01", 110_000),
    ]);
    expect(bandSegments(chart.bands[0])).toEqual([[0, 1]]);
  });

  it("starts the run where the data starts, not at index 0", () => {
    const chart = chartOf(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("BSU", "2026-08-01", 45_000),
      ],
      ["Fond", "BSU"]
    );
    expect(bandSegments(chart.bands[1])).toEqual([[1]]);
  });

  it("returns no runs for a band that is null everywhere", () => {
    // Constructed directly: stackedSeries never emits an all-null band, but
    // the drawing code must not assume that.
    expect(
      bandSegments({
        category: "Tom",
        values: [null, null],
        lower: [null, null],
        upper: [null, null],
        baselineAt: [0, 0],
        firstIndex: -1,
        latest: 0,
        latestDate: "",
        change: null,
        stale: true,
        lastObserved: "",
      })
    ).toEqual([]);
  });

  it("splits a band with an interior gap into separate runs", () => {
    expect(
      bandSegments({
        category: "Hull",
        values: [1, null, 2, 3],
        lower: [0, null, 0, 0],
        upper: [1, null, 2, 3],
        baselineAt: [0, 0, 0, 0],
        firstIndex: 0,
        latest: 3,
        latestDate: "",
        change: null,
        stale: false,
        lastObserved: "",
      })
    ).toEqual([[0], [2, 3]]);
  });
});

describe("labelledDates (chart axis thinning)", () => {
  it("labels everything when the dates are well spread", () => {
    expect(labelledDates([0, 0.25, 0.5, 0.75, 1])).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps the first and last", () => {
    const kept = labelledDates([0, 0.01, 0.02, 0.03, 1]);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(4);
  });

  it("drops labels that would collide with a clustered neighbour", () => {
    // Four dates within 3% of each other, then a gap: only one of the cluster
    // survives alongside the far one.
    expect(labelledDates([0, 0.01, 0.02, 0.03, 1])).toEqual([0, 4]);
  });

  it("drops a label too close to the final one rather than overlapping it", () => {
    // 0.98 is within the gap of 1.0, so it must go — the last is mandatory.
    expect(labelledDates([0, 0.5, 0.98, 1])).toEqual([0, 1, 3]);
  });

  it("handles one date and none at all", () => {
    expect(labelledDates([0.5])).toEqual([0]);
    expect(labelledDates([])).toEqual([]);
  });

  it("never returns a duplicate index", () => {
    const kept = labelledDates([0, 0.001, 1]);
    expect(new Set(kept).size).toBe(kept.length);
  });
});

describe("shortAmount (chart axis labels)", () => {
  it("leaves zero alone", () => {
    expect(shortAmount(0)).toBe("0");
  });

  it("keeps values under a thousand exact", () => {
    expect(shortAmount(750)).toBe("750");
  });

  it("abbreviates thousands", () => {
    expect(shortAmount(124_500)).toBe("125k");
    expect(shortAmount(1_000)).toBe("1k");
  });

  it("abbreviates millions with a Norwegian decimal comma", () => {
    expect(shortAmount(1_240_000)).toBe("1,2M");
    expect(shortAmount(12_400_000)).toBe("12M");
  });
});

describe("bandShapes (stack watertightness)", () => {
  it("anchors a band that starts mid-timeline to the band below it", () => {
    // Aksje appears only on the last date. Without an anchor at index 0 the
    // bands above it interpolate toward its height while it starts abruptly,
    // tearing a wedge of background open between two layers.
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("Aksje", "2026-08-01", 20_000),
        snap("Topp", "2026-06-01", 5_000),
        snap("Topp", "2026-08-01", 5_000),
      ],
      ["Fond", "Aksje", "Topp"]
    );

    const aksje = chart.bands.find((b) => b.category === "Aksje")!;
    const shapes = bandShapes(aksje);
    expect(shapes).toHaveLength(1);

    const [shape] = shapes;
    expect(shape[0]).toEqual({
      index: 0,
      lower: 100_000,
      upper: 100_000,
      anchor: true,
    });
    expect(shape[1]).toEqual({
      index: 1,
      lower: 100_000,
      upper: 120_000,
      anchor: false,
    });
  });

  it("puts the anchor flush with the top of the band below, so there is no seam", () => {
    const chart = stackedSeries(
      [
        snap("Fond", "2026-06-01", 100_000),
        snap("Fond", "2026-08-01", 110_000),
        snap("Aksje", "2026-08-01", 20_000),
      ],
      ["Fond", "Aksje"]
    );
    const fond = chart.bands[0];
    const aksje = chart.bands[1];
    const anchor = bandShapes(aksje)[0][0];
    // The anchor sits exactly on Fond's upper edge at that index.
    expect(anchor.lower).toBe(fond.upper[anchor.index]);
    expect(anchor.upper).toBe(fond.upper[anchor.index]);
  });

  it("adds no anchor when the band spans the whole timeline", () => {
    const chart = stackedSeries([
      snap("Fond", "2026-06-01", 100_000),
      snap("Fond", "2026-08-01", 110_000),
    ]);
    const shape = bandShapes(chart.bands[0])[0];
    expect(shape.every((point) => !point.anchor)).toBe(true);
    expect(shape.map((p) => p.index)).toEqual([0, 1]);
  });

  it("closes both ends of an interior gap", () => {
    const shapes = bandShapes({
      category: "Hull",
      values: [null, 5, null, 7, null],
      lower: [null, 10, null, 10, null],
      upper: [null, 15, null, 17, null],
      baselineAt: [10, 10, 10, 10, 10],
      firstIndex: 1,
      latest: 7,
      latestDate: "",
      change: null,
      stale: true,
      lastObserved: "",
    });
    expect(shapes).toHaveLength(2);
    // Each run is bracketed by flat anchors on the baseline.
    shapes.forEach((shape) => {
      expect(shape[0].anchor).toBe(true);
      expect(shape[0].lower).toBe(shape[0].upper);
      expect(shape[shape.length - 1].anchor).toBe(true);
      expect(shape[shape.length - 1].lower).toBe(shape[shape.length - 1].upper);
    });
    expect(shapes[0].map((p) => p.index)).toEqual([0, 1, 2]);
    expect(shapes[1].map((p) => p.index)).toEqual([2, 3, 4]);
  });

  it("returns nothing for a band that is null throughout", () => {
    expect(
      bandShapes({
        category: "Tom",
        values: [null, null],
        lower: [null, null],
        upper: [null, null],
        baselineAt: [0, 0],
        firstIndex: -1,
        latest: 0,
        latestDate: "",
        change: null,
        stale: true,
        lastObserved: "",
      })
    ).toEqual([]);
  });

  it("keeps every band's drawn thickness summing to the total at each date", () => {
    const rows = [
      snap("Fond", "2026-01-01", 100_000),
      snap("Fond", "2026-06-01", 110_000),
      snap("Aksje", "2026-06-01", 20_000),
      snap("BSU", "2026-01-01", 30_000),
      snap("BSU", "2026-06-01", 0),
    ];
    const chart = stackedSeries(rows, ["Fond", "Aksje", "BSU"]);
    chart.dates.forEach((_, index) => {
      const summed = chart.bands.reduce((sum, band) => {
        const value = band.values[index];
        return sum + (value ?? 0);
      }, 0);
      expect(summed).toBe(chart.totals[index]);
    });
  });
});

describe("axisTicks (chart y-scale)", () => {
  it("covers the data, ending on the first tick at or above the max", () => {
    const ticks = axisTicks(205_600);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(205_600);
  });

  it("does not add an empty extra band above the data", () => {
    // The top tick must be the FIRST one at or above max, not one beyond it.
    const ticks = axisTicks(205_600);
    const step = ticks[1] - ticks[0];
    expect(ticks[ticks.length - 1] - step).toBeLessThan(205_600);
  });

  it("lands exactly on the max when the max is already round", () => {
    const ticks = axisTicks(200_000);
    expect(ticks[ticks.length - 1]).toBe(200_000);
  });

  it("uses evenly spaced, round steps", () => {
    const ticks = axisTicks(124_500);
    const step = ticks[1] - ticks[0];
    ticks.forEach((tick, index) => expect(tick).toBe(index * step));
    expect(step % 1).toBe(0);
  });

  it("keeps the gridline count small", () => {
    for (const max of [1, 999, 124_500, 205_600, 3_400_000]) {
      expect(axisTicks(max).length).toBeLessThanOrEqual(6);
    }
  });

  it("does not waste a third of the plot on headroom", () => {
    // A 205 600 max used to pick a 100 000 step and top out at 300 000.
    for (const max of [1_500, 47_000, 124_500, 163_000, 205_600, 3_400_000]) {
      const ticks = axisTicks(max);
      const top = ticks[ticks.length - 1];
      expect(top).toBeGreaterThanOrEqual(max);
      expect(max / top).toBeGreaterThan(0.75);
    }
  });

  it("uses a nice step rather than an arbitrary fraction of the max", () => {
    const nice = (value: number) => {
      const mag = 10 ** Math.floor(Math.log10(value));
      return [1, 2, 2.5, 5, 10].some(
        (m) => Math.abs(value / (m * mag) - 1) < 1e-9
      );
    };
    for (const max of [1_500, 47_000, 124_500, 205_600, 3_400_000]) {
      const ticks = axisTicks(max);
      expect(nice(ticks[1] - ticks[0])).toBe(true);
    }
  });

  it("handles a zero or negative max without looping", () => {
    expect(axisTicks(0)).toEqual([0]);
    expect(axisTicks(-5)).toEqual([0]);
  });
});
