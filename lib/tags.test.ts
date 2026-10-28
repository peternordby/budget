import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/lib/insights";
import { tagSummaries } from "@/lib/tags";

let nextId = 1;
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    item: "Kaffe",
    amount: 100,
    category: "Spise ute",
    kind: "variable",
    date: "2026-07-01",
    tag: "Roma",
    ...overrides,
  };
}

describe("tagSummaries", () => {
  it("sums a tag's spending over every day from first to last", () => {
    const [roma] = tagSummaries([
      entry({ date: "2026-07-01", amount: 300 }),
      entry({ date: "2026-07-03", amount: 1200, category: "Reise" }),
      entry({ date: "2026-07-03", amount: 50 }),
    ]);
    expect(roma.total).toBe(1550);
    expect(roma.count).toBe(3);
    expect(roma.days).toBe(3);
    expect(roma.daily.map((day) => day.spent)).toEqual([300, 0, 1250]);
    expect(roma.byCategory).toEqual([
      { category: "Reise", value: 1200 },
      { category: "Spise ute", value: 350 },
    ]);
    expect(roma.top[0].amount).toBe(1200);
  });

  it("crosses a month end, and leaves out untagged rows, income and savings", () => {
    const [roma] = tagSummaries([
      entry({ date: "2026-06-30" }),
      entry({ date: "2026-07-01" }),
      entry({ tag: null, amount: 9999 }),
      entry({ tag: "  ", amount: 9999 }),
      entry({ kind: "income", amount: 9999 }),
      entry({ kind: "savings", amount: 9999 }),
    ]);
    expect(roma.total).toBe(200);
    expect(roma.days).toBe(2);
  });

  it("puts the most recent trip first", () => {
    const tags = tagSummaries([
      entry({ tag: "Roma", date: "2025-07-01" }),
      entry({ tag: "Berlin", date: "2026-03-01" }),
    ]);
    expect(tags.map((tag) => tag.tag)).toEqual(["Berlin", "Roma"]);
  });
});
