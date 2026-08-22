import { describe, expect, it } from "vitest";
import { detectSubscriptions } from "@/lib/subscriptions";
import { type LedgerEntry, type MonthRef } from "@/lib/insights";
import { type RecurringTemplate } from "@/lib/recurring";

const MONTHS: MonthRef[] = [
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
  { year: 2026, month: 8 },
];

let nextId = 1;

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    item: "Netflix",
    amount: 199,
    category: "Underholdning",
    kind: "variable",
    date: "2026-08-05",
    tag: null,
    ...overrides,
  };
}

function template(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 1,
    item: "Netflix",
    price: 199,
    category_id: 3,
    tag: null,
    day_of_month: 5,
    active: true,
    ...overrides,
  };
}

function monthly(item: string, amounts: number[]) {
  return amounts.map((amount, index) =>
    entry({ item, amount, date: `2026-0${6 + index}-05` })
  );
}

describe("detectSubscriptions", () => {
  it("finds nothing in an empty ledger", () => {
    expect(detectSubscriptions([], [], MONTHS)).toEqual([]);
  });

  it("flags an item appearing in every month at the same amount", () => {
    const found = detectSubscriptions(monthly("Netflix", [199, 199, 199]), [], MONTHS);
    expect(found).toHaveLength(1);
    expect(found[0].item).toBe("Netflix");
    expect(found[0].monthsSeen).toBe(3);
    expect(found[0].typicalAmount).toBe(199);
  });

  it("ignores an item appearing in only two months", () => {
    const found = detectSubscriptions(
      [entry({ date: "2026-06-05" }), entry({ date: "2026-07-05" })],
      [],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("tolerates a price change within 15 percent", () => {
    // A subscription that went up is still a subscription.
    const found = detectSubscriptions(monthly("Netflix", [199, 199, 219]), [], MONTHS);
    expect(found).toHaveLength(1);
  });

  it("rejects amounts that vary too much to be a subscription", () => {
    const found = detectSubscriptions(monthly("Rema 1000", [200, 800, 450]), [], MONTHS);
    expect(found).toEqual([]);
  });

  it("ignores an item that already has an active template", () => {
    const found = detectSubscriptions(monthly("Netflix", [199, 199, 199]), [template()], MONTHS);
    expect(found).toEqual([]);
  });

  it("matches a template case-insensitively and ignoring surrounding space", () => {
    const found = detectSubscriptions(
      monthly("netflix", [199, 199, 199]),
      [template({ item: "  Netflix  " })],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("still flags an item whose template is paused", () => {
    // A paused template means the user stopped auto-booking it, not that the
    // subscription stopped costing money.
    const found = detectSubscriptions(
      monthly("Netflix", [199, 199, 199]),
      [template({ active: false })],
      MONTHS
    );
    expect(found).toHaveLength(1);
  });

  it("does not match a template whose price differs", () => {
    // Matching on item alone is deliberate: a subscription whose price rose
    // since the template was written is still covered by that template.
    const found = detectSubscriptions(
      monthly("Netflix", [249, 249, 249]),
      [template({ price: 199 })],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("reports monthly and annual cost from the typical amount", () => {
    const found = detectSubscriptions(monthly("Netflix", [199, 199, 199]), [], MONTHS);
    expect(found[0].monthlyCost).toBe(199);
    expect(found[0].annualCost).toBe(199 * 12);
  });

  it("sorts by annual cost descending", () => {
    const found = detectSubscriptions(
      [...monthly("Netflix", [199, 199, 199]), ...monthly("Spotify", [129, 129, 129])],
      [],
      MONTHS
    );
    expect(found.map((s) => s.item)).toEqual(["Netflix", "Spotify"]);
  });

  it("ignores entries outside the window", () => {
    const found = detectSubscriptions(
      [
        entry({ date: "2025-01-05" }),
        entry({ date: "2025-02-05" }),
        entry({ date: "2025-03-05" }),
      ],
      [],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("counts months, not transactions", () => {
    // Three charges in one month is not a monthly subscription.
    const found = detectSubscriptions(
      [
        entry({ date: "2026-07-01" }),
        entry({ date: "2026-07-10" }),
        entry({ date: "2026-07-20" }),
      ],
      [],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("reports the most recent date it was seen", () => {
    const found = detectSubscriptions(monthly("Netflix", [199, 199, 199]), [], MONTHS);
    expect(found[0].lastDate).toBe("2026-08-05");
  });

  it("keeps the most recent spelling as the display item, not the normalised key", () => {
    // The grouping key is normalised (trimmed, lowercased), but the reported
    // item should carry the most recent entry's original casing, matching how
    // lib/autocomplete.ts picks a display spelling.
    const found = detectSubscriptions(
      [
        entry({ item: "NETFLIX", date: "2026-06-05" }),
        entry({ item: "netflix", date: "2026-07-05" }),
        entry({ item: "Netflix", date: "2026-08-05" }),
      ],
      [],
      MONTHS
    );
    expect(found[0].item).toBe("Netflix");
  });

  it("ignores income entries", () => {
    const found = detectSubscriptions(
      [
        entry({ item: "Lønn", kind: "income", amount: 30000, date: "2026-06-25" }),
        entry({ item: "Lønn", kind: "income", amount: 30000, date: "2026-07-25" }),
        entry({ item: "Lønn", kind: "income", amount: 30000, date: "2026-08-25" }),
      ],
      [],
      MONTHS
    );
    expect(found).toEqual([]);
  });

  it("ignores savings entries", () => {
    // A transfer to savings is not spending, so a steady monthly transfer
    // must not be reported as an untracked subscription.
    const found = detectSubscriptions(
      [
        entry({ item: "Sparekonto", kind: "savings", amount: 2000, date: "2026-06-25" }),
        entry({ item: "Sparekonto", kind: "savings", amount: 2000, date: "2026-07-25" }),
        entry({ item: "Sparekonto", kind: "savings", amount: 2000, date: "2026-08-25" }),
      ],
      [],
      MONTHS
    );
    expect(found).toEqual([]);
  });
});
