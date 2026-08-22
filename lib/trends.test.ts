import { describe, expect, it } from "vitest";
import { categorySeries, mixSummary, spendingMix } from "@/lib/trends";
import { type LedgerEntry, type MonthRef } from "@/lib/insights";
import { type CategoryKind } from "@/lib/categories";

const MONTHS: MonthRef[] = [
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
  { year: 2026, month: 8 },
];

let nextId = 1;

function entry(
  overrides: Partial<LedgerEntry> & { kind?: CategoryKind } = {}
): LedgerEntry {
  return {
    id: nextId++,
    item: "Rema 1000",
    amount: 100,
    category: "Mat",
    kind: "variable",
    date: "2026-08-05",
    tag: null,
    ...overrides,
  };
}

describe("categorySeries", () => {
  it("returns nothing for an empty ledger", () => {
    expect(categorySeries([], MONTHS)).toEqual([]);
  });

  it("aligns points to the requested months, zero-filling gaps", () => {
    const series = categorySeries(
      [
        entry({ category: "Mat", amount: 500, date: "2026-06-10" }),
        entry({ category: "Mat", amount: 700, date: "2026-08-10" }),
      ],
      MONTHS
    );
    expect(series).toHaveLength(1);
    expect(series[0].points).toEqual([500, 0, 700]);
  });

  it("sums several entries within one month", () => {
    const series = categorySeries(
      [
        entry({ amount: 100, date: "2026-07-01" }),
        entry({ amount: 250, date: "2026-07-20" }),
      ],
      MONTHS
    );
    expect(series[0].points).toEqual([0, 350, 0]);
  });

  it("sorts categories by total descending", () => {
    const series = categorySeries(
      [
        entry({ category: "Mat", amount: 100, date: "2026-07-01" }),
        entry({ category: "Transport", amount: 900, date: "2026-07-01" }),
      ],
      MONTHS
    );
    expect(series.map((s) => s.category)).toEqual(["Transport", "Mat"]);
  });

  it("reports total, mean and median across the window", () => {
    const series = categorySeries(
      [
        entry({ amount: 100, date: "2026-06-01" }),
        entry({ amount: 300, date: "2026-07-01" }),
        entry({ amount: 200, date: "2026-08-01" }),
      ],
      MONTHS
    );
    expect(series[0].total).toBe(600);
    expect(series[0].mean).toBe(200);
    expect(series[0].median).toBe(200);
  });

  it("computes the median over every month in the window, including zeroes", () => {
    // A category active in one month of three has a median of 0, not of its
    // single value — the quiet months are real data about that category.
    const series = categorySeries(
      [entry({ amount: 900, date: "2026-08-01" })],
      MONTHS
    );
    expect(series[0].median).toBe(0);
  });

  it("computes the mean over every month in the window, including zeroes", () => {
    // A category active in one month of three has a mean of total / 3, not
    // total / 1 — the divisor is the whole window, not just the months with
    // spend, exactly like the median above.
    const series = categorySeries(
      [entry({ amount: 900, date: "2026-08-01" })],
      MONTHS
    );
    expect(series[0].mean).toBe(300);
  });

  it("excludes income and savings", () => {
    const series = categorySeries(
      [
        entry({ category: "Inntekter", kind: "income", amount: 30000, date: "2026-07-01" }),
        entry({ category: "Buffer", kind: "savings", amount: 5000, date: "2026-07-01" }),
        entry({ category: "Mat", amount: 100, date: "2026-07-01" }),
      ],
      MONTHS
    );
    expect(series.map((s) => s.category)).toEqual(["Mat"]);
  });

  it("includes an income category when includeAllKinds is true", () => {
    const series = categorySeries(
      [
        entry({ category: "Inntekter", kind: "income", amount: 30000, date: "2026-07-01" }),
        entry({ category: "Mat", amount: 100, date: "2026-07-01" }),
      ],
      MONTHS,
      { includeAllKinds: true }
    );
    const income = series.find((s) => s.category === "Inntekter");
    expect(income).toBeDefined();
    expect(income!.points).toEqual([0, 30000, 0]);
    expect(income!.kind).toBe("income");
  });

  it("includes a savings category when includeAllKinds is true", () => {
    const series = categorySeries(
      [
        entry({ category: "Buffer", kind: "savings", amount: 5000, date: "2026-08-01" }),
        entry({ category: "Mat", amount: 100, date: "2026-07-01" }),
      ],
      MONTHS,
      { includeAllKinds: true }
    );
    const savings = series.find((s) => s.category === "Buffer");
    expect(savings).toBeDefined();
    expect(savings!.points).toEqual([0, 0, 5000]);
    expect(savings!.kind).toBe("savings");
  });

  it("keeps fixed and variable apart as separate categories but includes both", () => {
    const series = categorySeries(
      [
        entry({ category: "Husleie", kind: "fixed", amount: 12000, date: "2026-07-01" }),
        entry({ category: "Mat", kind: "variable", amount: 100, date: "2026-07-01" }),
      ],
      MONTHS
    );
    expect(series.map((s) => s.category)).toEqual(["Husleie", "Mat"]);
    expect(series[0].kind).toBe("fixed");
  });

  it("ignores entries outside the window", () => {
    const series = categorySeries(
      [entry({ amount: 100, date: "2025-01-01" })],
      MONTHS
    );
    expect(series).toEqual([]);
  });
});

const SIX_MONTHS: MonthRef[] = [
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
  { year: 2026, month: 8 },
];

describe("spendingMix", () => {
  it("zero-fills every month in the window", () => {
    expect(spendingMix([], MONTHS)).toEqual([
      { key: "2026-06", income: 0, fixed: 0, variable: 0, savings: 0 },
      { key: "2026-07", income: 0, fixed: 0, variable: 0, savings: 0 },
      { key: "2026-08", income: 0, fixed: 0, variable: 0, savings: 0 },
    ]);
  });

  it("splits each kind into its own bucket", () => {
    const points = spendingMix(
      [
        entry({ kind: "income", amount: 40000, date: "2026-08-01" }),
        entry({ kind: "fixed", amount: 12000, date: "2026-08-02" }),
        entry({ kind: "variable", amount: 5000, date: "2026-08-03" }),
        entry({ kind: "savings", amount: 3000, date: "2026-08-04" }),
      ],
      MONTHS
    );
    expect(points[2]).toEqual({
      key: "2026-08",
      income: 40000,
      fixed: 12000,
      variable: 5000,
      savings: 3000,
    });
  });

  it("ignores entries outside the window", () => {
    const points = spendingMix(
      [entry({ kind: "fixed", amount: 999, date: "2025-01-05" })],
      MONTHS
    );
    expect(points.every((point) => point.fixed === 0)).toBe(true);
  });
});

describe("mixSummary", () => {
  it("has nothing to average over an empty window", () => {
    const summary = mixSummary([]);
    expect(summary.months).toBe(0);
    expect(summary.base).toBe(0);
    expect(summary.trend).toBeNull();
    expect(summary.headroom).toBeNull();
  });

  it("averages per month and leaves the unspent income as leftover", () => {
    const points = spendingMix(
      [
        entry({ kind: "income", amount: 30000, date: "2026-07-01" }),
        entry({ kind: "income", amount: 30000, date: "2026-08-01" }),
        entry({ kind: "fixed", amount: 10000, date: "2026-07-02" }),
        entry({ kind: "fixed", amount: 10000, date: "2026-08-02" }),
        entry({ kind: "variable", amount: 4000, date: "2026-08-03" }),
      ],
      MONTHS
    );
    const summary = mixSummary(points);
    // Three months in the window, two of them with income.
    expect(summary.income).toBe(20000);
    expect(summary.fixed).toBeCloseTo(6666.67, 1);
    expect(summary.base).toBe(20000);
    expect(summary.leftover).toBeCloseTo(20000 - 6666.67 - 1333.33, 1);
  });

  it("draws against outgoings when spending exceeds income, so leftover is never negative", () => {
    const points = spendingMix(
      [
        entry({ kind: "income", amount: 1000, date: "2026-08-01" }),
        entry({ kind: "fixed", amount: 5000, date: "2026-08-02" }),
      ],
      [{ year: 2026, month: 8 }]
    );
    const summary = mixSummary(points);
    expect(summary.base).toBe(5000);
    expect(summary.leftover).toBe(0);
  });

  it("reports no income as null rather than as zero percent locked in", () => {
    const points = spendingMix(
      [entry({ kind: "fixed", amount: 5000, date: "2026-08-02" })],
      MONTHS
    );
    const summary = mixSummary(points);
    expect(summary.fixedShareOfIncome).toBeNull();
    expect(summary.headroom).toBeNull();
  });

  it("computes the share of income and the headroom left after it", () => {
    const points = spendingMix(
      [
        entry({ kind: "income", amount: 20000, date: "2026-08-01" }),
        entry({ kind: "fixed", amount: 5000, date: "2026-08-02" }),
      ],
      [{ year: 2026, month: 8 }]
    );
    const summary = mixSummary(points);
    expect(summary.fixedShareOfIncome).toBe(0.25);
    expect(summary.headroom).toBe(15000);
  });

  it("catches a fixed cost creeping upward across the window", () => {
    const points = spendingMix(
      [
        entry({ kind: "fixed", amount: 1000, date: "2026-03-01" }),
        entry({ kind: "fixed", amount: 1000, date: "2026-04-01" }),
        entry({ kind: "fixed", amount: 1000, date: "2026-05-01" }),
        entry({ kind: "fixed", amount: 1400, date: "2026-06-01" }),
        entry({ kind: "fixed", amount: 1400, date: "2026-07-01" }),
        entry({ kind: "fixed", amount: 1400, date: "2026-08-01" }),
      ],
      SIX_MONTHS
    );
    const summary = mixSummary(points);
    expect(summary.trend).toEqual({
      previous: 1000,
      recent: 1400,
      delta: 400,
      months: 3,
    });
  });

  it("drops the middle month of an odd window rather than letting it tilt one side", () => {
    const points = spendingMix(
      [
        entry({ kind: "fixed", amount: 100, date: "2026-04-01" }),
        entry({ kind: "fixed", amount: 9999, date: "2026-05-01" }),
        entry({ kind: "fixed", amount: 300, date: "2026-06-01" }),
        entry({ kind: "fixed", amount: 400, date: "2026-07-01" }),
        entry({ kind: "fixed", amount: 500, date: "2026-08-01" }),
      ],
      SIX_MONTHS.slice(1)
    );
    const summary = mixSummary(points);
    expect(summary.trend?.months).toBe(2);
    expect(summary.trend?.previous).toBe((100 + 9999) / 2);
    expect(summary.trend?.recent).toBe((400 + 500) / 2);
  });

  it("refuses a trend on a window too short to have two halves", () => {
    const points = spendingMix([], MONTHS);
    expect(mixSummary(points).trend).toBeNull();
  });
});
