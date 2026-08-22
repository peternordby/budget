import { describe, expect, it } from "vitest";
import { categorySeries, fixedVariableSplit, savingsRate } from "@/lib/trends";
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

describe("fixedVariableSplit", () => {
  it("returns one point per month, zero-filled", () => {
    const split = fixedVariableSplit([], MONTHS);
    expect(split.map((p) => p.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(split.every((p) => p.fixed === 0 && p.variable === 0)).toBe(true);
  });

  it("separates fixed from variable", () => {
    const split = fixedVariableSplit(
      [
        entry({ kind: "fixed", amount: 12000, date: "2026-07-01" }),
        entry({ kind: "variable", amount: 3000, date: "2026-07-02" }),
      ],
      MONTHS
    );
    expect(split[1]).toEqual({ key: "2026-07", fixed: 12000, variable: 3000 });
  });

  it("counts neither income nor savings", () => {
    const split = fixedVariableSplit(
      [
        entry({ kind: "income", amount: 30000, date: "2026-07-01" }),
        entry({ kind: "savings", amount: 5000, date: "2026-07-01" }),
      ],
      MONTHS
    );
    expect(split[1]).toEqual({ key: "2026-07", fixed: 0, variable: 0 });
  });
});

describe("savingsRate", () => {
  it("returns one point per month", () => {
    expect(savingsRate([], MONTHS).map((p) => p.key)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("reports null rather than zero when there is no income", () => {
    // "We cannot say" is a different claim from "you saved nothing".
    const points = savingsRate(
      [entry({ amount: 1000, date: "2026-07-01" })],
      MONTHS
    );
    expect(points[1].rate).toBeNull();
  });

  it("computes net over income", () => {
    const points = savingsRate(
      [
        entry({ kind: "income", category: "Inntekter", amount: 40000, date: "2026-07-01" }),
        entry({ amount: 10000, date: "2026-07-02" }),
      ],
      MONTHS
    );
    expect(points[1].income).toBe(40000);
    expect(points[1].net).toBe(30000);
    expect(points[1].rate).toBeCloseTo(0.75);
  });

  it("does not let a savings transfer reduce the rate", () => {
    // Moving money to savings is not spending it — the whole point of the
    // savings kind. A month where everything left over went to savings is a
    // 100% rate, not a 0% one.
    const points = savingsRate(
      [
        entry({ kind: "income", category: "Inntekter", amount: 10000, date: "2026-07-01" }),
        entry({ kind: "savings", category: "Buffer", amount: 10000, date: "2026-07-02" }),
      ],
      MONTHS
    );
    expect(points[1].rate).toBe(1);
    expect(points[1].savings).toBe(10000);
  });

  it("goes negative when spending exceeds income", () => {
    const points = savingsRate(
      [
        entry({ kind: "income", category: "Inntekter", amount: 10000, date: "2026-07-01" }),
        entry({ amount: 15000, date: "2026-07-02" }),
      ],
      MONTHS
    );
    expect(points[1].rate).toBeCloseTo(-0.5);
  });
});
