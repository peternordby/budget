import { describe, expect, it } from "vitest";
import {
  addMonths,
  aggregateByMonth,
  compareMonths,
  detectAnomalies,
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

describe("compareMonths", () => {
  const selected = { year: 2026, month: 8 };

  it("returns null when neither month has data", () => {
    expect(compareMonths([], selected)).toBeNull();
  });

  it("reports the percentage change in expenses", () => {
    const result = compareMonths(
      [
        entry({ amount: 1000, date: "2026-07-10" }),
        entry({ amount: 1500, date: "2026-08-10" }),
      ],
      selected
    );
    expect(result?.expensePct).toBe(50);
  });

  it("ranks movers by absolute change and excludes income", () => {
    const result = compareMonths(
      [
        entry({ amount: 1000, category: "Mat", date: "2026-07-10" }),
        entry({ amount: 1200, category: "Mat", date: "2026-08-10" }),
        entry({ amount: 100, category: "Transport", date: "2026-07-11" }),
        entry({ amount: 900, category: "Transport", date: "2026-08-11" }),
        entry({ amount: 30000, category: "Inntekter", kind: "income", date: "2026-08-01" }),
      ],
      selected
    );
    expect(result?.movers.map((m) => m.category)).toEqual(["Transport", "Mat"]);
  });

  it("reports a null percentage when the previous month had nothing in that category", () => {
    const result = compareMonths(
      [entry({ amount: 500, category: "Ferie", date: "2026-08-10" })],
      selected
    );
    expect(result?.movers[0].pct).toBeNull();
  });

  it("leaves savings out of the movers", () => {
    const result = compareMonths(
      [
        entry({ amount: 1000, kind: "savings", category: "Buffer", date: "2026-07-10" }),
        entry({ amount: 9000, kind: "savings", category: "Buffer", date: "2026-08-10" }),
        entry({ amount: 100, kind: "variable", category: "Mat", date: "2026-08-11" }),
      ],
      { year: 2026, month: 8 }
    );
    expect(result?.movers.map((m) => m.category)).not.toContain("Buffer");
  });
});

describe("detectAnomalies", () => {
  const selected = { year: 2026, month: 8 };

  it("finds nothing in an empty ledger", () => {
    expect(detectAnomalies([], selected)).toEqual([]);
  });

  it("flags identical item, amount and date as a possible duplicate", () => {
    const anomalies = detectAnomalies(
      [
        entry({ item: "Kino", amount: 200, date: "2026-08-09" }),
        entry({ item: "Kino", amount: 200, date: "2026-08-09" }),
      ],
      selected
    );
    expect(anomalies.filter((a) => a.kind === "duplicate")).toHaveLength(1);
  });

  it("flags a category appearing for the first time in the window", () => {
    const anomalies = detectAnomalies(
      [entry({ category: "Bilreparasjon", amount: 9000, date: "2026-08-09" })],
      selected
    );
    expect(anomalies.some((a) => a.kind === "new-category")).toBe(true);
  });

  it("does not flag a new category below the reporting threshold", () => {
    const anomalies = detectAnomalies(
      [entry({ category: "Snacks", amount: 100, date: "2026-08-09" })],
      selected
    );
    expect(anomalies.some((a) => a.kind === "new-category")).toBe(false);
  });

  it("flags a category whose month is far above its own history", () => {
    const history: LedgerEntry[] = [
      entry({ category: "Mat", amount: 1000, date: "2026-05-05" }),
      entry({ category: "Mat", amount: 1000, date: "2026-06-05" }),
      entry({ category: "Mat", amount: 1000, date: "2026-07-05" }),
      entry({ category: "Mat", amount: 4000, date: "2026-08-05" }),
    ];
    const anomalies = detectAnomalies(history, selected);
    expect(anomalies.some((a) => a.kind === "category-spike")).toBe(true);
  });

  it("ignores income entirely", () => {
    const anomalies = detectAnomalies(
      [entry({ category: "Inntekter", kind: "income", amount: 99000, date: "2026-08-01" })],
      selected
    );
    expect(anomalies).toEqual([]);
  });

  it("ignores savings transfers", () => {
    const anomalies = detectAnomalies(
      [entry({ category: "Buffer", kind: "savings", amount: 50000, date: "2026-08-01" })],
      selected
    );
    expect(anomalies).toEqual([]);
  });

  it("orders bad before warn before info", () => {
    const anomalies = detectAnomalies(
      [
        // Three months of history then a 4x month -> category-spike, severity "bad".
        entry({ category: "Mat", amount: 1000, date: "2026-05-05" }),
        entry({ category: "Mat", amount: 1000, date: "2026-06-05" }),
        entry({ category: "Mat", amount: 1000, date: "2026-07-05" }),
        entry({ category: "Mat", amount: 4000, date: "2026-08-05" }),
        // Identical item, amount and date -> duplicate, severity "warn".
        // Its own category, so it does not perturb the spike arithmetic above.
        entry({ item: "Kino", category: "Kino", amount: 200, date: "2026-08-09" }),
        entry({ item: "Kino", category: "Kino", amount: 200, date: "2026-08-09" }),
        // First appearance above the reporting floor -> new-category, severity "info".
        entry({ category: "Bilreparasjon", amount: 9000, date: "2026-08-10" }),
      ],
      selected
    );

    // Without this, the ordering assertion below can silently degrade to
    // comparing a two-element array the moment a threshold moves.
    expect(new Set(anomalies.map((a) => a.severity))).toEqual(
      new Set(["bad", "warn", "info"])
    );

    const ranks = { bad: 0, warn: 1, info: 2 } as const;
    const seen = anomalies.map((a) => ranks[a.severity]);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});
