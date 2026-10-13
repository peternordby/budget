import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/lib/insights";
import {
  calendarDays,
  incomeWaterfall,
  kiloAmount,
  mondayOffset,
  weekdayAverages,
} from "@/lib/periodStats";

let nextId = 1;
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    item: "Rema 1000",
    amount: 400,
    category: "Mat",
    kind: "variable",
    date: "2026-09-05",
    tag: null,
    ...overrides,
  };
}

const SEP = { year: 2026, month: 9 };

describe("kiloAmount", () => {
  it("keeps small amounts whole and shortens thousands to one decimal", () => {
    expect(kiloAmount(253)).toBe("253");
    expect(kiloAmount(9120)).toBe("9,1k");
    expect(kiloAmount(3000)).toBe("3k");
    expect(kiloAmount(48_929)).toBe("48,9k");
  });
});

describe("calendarDays", () => {
  it("buckets spending and income per day and keeps the five largest purchases", () => {
    const days = calendarDays(
      [
        ...[100, 300, 50, 700, 20, 900].map((amount) => entry({ amount, date: "2026-09-02" })),
        entry({ kind: "income", category: "Lønn", amount: 5000, date: "2026-09-02" }),
        entry({ kind: "savings", amount: 999, date: "2026-09-02" }),
        entry({ amount: 50, date: "2026-10-02" }),
      ],
      [SEP]
    );
    expect(days).toHaveLength(30);
    expect(days[1]).toMatchObject({ spent: 2070, income: 5000, weekday: 2 });
    expect(days[1].top.map((e) => e.amount)).toEqual([900, 700, 300, 100, 50]);
    expect(days[0].spent).toBe(0);
  });

  it("spans every selected month", () => {
    expect(calendarDays([], [SEP, { year: 2026, month: 10 }])).toHaveLength(61);
  });

  it("starts the week on Monday", () => {
    // 1 September 2026 is a Tuesday.
    expect(mondayOffset(SEP)).toBe(1);
  });
});

describe("incomeWaterfall", () => {
  it("steps down from income, largest category first, to what is left", () => {
    const steps = incomeWaterfall([
      entry({ kind: "income", category: "Lønn", amount: 10_000 }),
      entry({ kind: "fixed", category: "Leie", amount: 6_000 }),
      entry({ category: "Mat", amount: 1_000 }),
      entry({ category: "Mat", amount: 500 }),
      entry({ kind: "savings", category: "Fond", amount: 2_000 }),
    ]);
    expect(steps.map((s) => [s.label, s.from, s.to])).toEqual([
      ["Inntekt", 0, 10_000],
      ["Leie", 10_000, 4_000],
      ["Mat", 4_000, 2_500],
      ["Igjen", 0, 2_500],
    ]);
  });

  it("has nothing to melt without income", () => {
    expect(incomeWaterfall([entry()])).toEqual([]);
  });
});

describe("weekdayAverages", () => {
  it("averages per weekday over the days that have happened", () => {
    const days = calendarDays(
      [entry({ amount: 300, date: "2026-09-01" }), entry({ amount: 100, date: "2026-09-08" })],
      [SEP]
    );
    // Tuesdays up to the 14th: the 1st and the 8th.
    const averages = weekdayAverages(days, "2026-09-14");
    expect(averages[1]).toBe(200);
    expect(averages[0]).toBe(0);
  });
});
