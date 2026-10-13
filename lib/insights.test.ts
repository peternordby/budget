import { describe, expect, it } from "vitest";
import {
  addMonths,
  aggregateByMonth,
  listWindowMonths,
  monthKey,
  previousMonth,
  type LedgerEntry,
} from "@/lib/insights";

let nextId = 1;

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    item: "Rema 1000",
    amount: 400,
    category: "Mat",
    kind: "variable",
    date: "2026-08-05",
    tag: null,
    ...overrides,
  };
}

describe("monthKey", () => {
  it("pads single-digit months", () => {
    expect(monthKey(2026, 3)).toBe("2026-03");
  });
});

describe("previousMonth", () => {
  it("steps back within a year", () => {
    expect(previousMonth({ year: 2026, month: 8 })).toEqual({ year: 2026, month: 7 });
  });

  it("wraps to December of the previous year", () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });
});

describe("addMonths", () => {
  it("moves forward across a year boundary", () => {
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });

  it("moves backward across a year boundary", () => {
    expect(addMonths({ year: 2026, month: 2 }, -3)).toEqual({ year: 2025, month: 11 });
  });
});

describe("listWindowMonths", () => {
  it("returns count months ending at the anchor, oldest first", () => {
    const months = listWindowMonths({ year: 2026, month: 2 }, 3);
    expect(months).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });
});

describe("aggregateByMonth", () => {
  const months = [
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
  ];

  it("returns a bucket per requested month, in order", () => {
    const totals = aggregateByMonth([], months);
    expect(totals.map((t) => t.key)).toEqual(["2026-07", "2026-08"]);
  });

  it("splits income from expenses and computes net", () => {
    const totals = aggregateByMonth(
      [
        entry({ amount: 30000, kind: "income", category: "Inntekter", date: "2026-08-01" }),
        entry({ amount: 400, date: "2026-08-05" }),
        entry({ amount: 600, date: "2026-08-06" }),
      ],
      months
    );
    const august = totals[1];
    expect(august.income).toBe(30000);
    expect(august.expenses).toBe(1000);
    expect(august.net).toBe(29000);
    expect(august.count).toBe(3);
  });

  it("ignores entries outside the requested months", () => {
    const totals = aggregateByMonth([entry({ date: "2026-05-01" })], months);
    expect(totals.every((t) => t.count === 0)).toBe(true);
  });

  it("reports savings separately and keeps them out of expenses", () => {
    const totals = aggregateByMonth(
      [
        entry({ amount: 30000, kind: "income", category: "Inntekter", date: "2026-08-01" }),
        entry({ amount: 1000, kind: "variable", category: "Mat", date: "2026-08-05" }),
        entry({ amount: 5000, kind: "savings", category: "Buffer", date: "2026-08-06" }),
      ],
      months
    );
    const august = totals[1];
    expect(august.expenses).toBe(1000);
    expect(august.savings).toBe(5000);
    // Money moved to savings is still yours — it does not reduce net.
    expect(august.net).toBe(29000);
  });

  it("counts fixed and variable together as expenses", () => {
    const totals = aggregateByMonth(
      [
        entry({ amount: 12000, kind: "fixed", category: "Husleie", date: "2026-08-01" }),
        entry({ amount: 1000, kind: "variable", category: "Mat", date: "2026-08-05" }),
      ],
      months
    );
    expect(totals[1].expenses).toBe(13000);
  });
});
