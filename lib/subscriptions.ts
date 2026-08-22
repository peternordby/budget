// Subscription creep detection: spending that recurs monthly but which the
// user never registered as a fixed expense (streaming, gym, cloud storage).
// The `recurring_expense` table (see lib/recurring.ts) covers what the user
// *has* registered; this finds what they have not.

import { isSpendingKind } from "@/lib/categories";
import { monthKey, type LedgerEntry, type MonthRef } from "@/lib/insights";
import { type RecurringTemplate } from "@/lib/recurring";

export type SuspectedSubscription = {
  item: string;
  category: string;
  monthsSeen: number;
  typicalAmount: number;
  monthlyCost: number;
  annualCost: number;
  lastDate: string;
  /** The ids of the expense rows this suspect was detected from, inside the
   *  window that was passed in. The registration flow on /innsikt stamps them
   *  with the template's recurring_id so RecurringPanel sees the months that
   *  are already paid for as booked instead of offering to book them again. */
  expenseIds: number[];
};

// Same normalisation as lib/autocomplete.ts's grouping key, so two spellings
// of a merchant are treated as genuinely different items (a real limitation,
// but preferable to fuzzy matching's false positives). Exported because
// /innsikt has to look up an existing template by the very same key this
// module suppressed (or failed to suppress) the suspect by — a second,
// slightly different normalisation there would reintroduce the duplicate.
export function normaliseItem(item: string) {
  return item.trim().toLowerCase();
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const SIMILARITY_TOLERANCE = 0.15;

export function detectSubscriptions(
  entries: LedgerEntry[],
  templates: RecurringTemplate[],
  months: MonthRef[]
): SuspectedSubscription[] {
  const windowKeys = new Set(months.map((ref) => monthKey(ref.year, ref.month)));

  const activeTemplateNames = new Set(
    templates.filter((t) => t.active).map((t) => normaliseItem(t.item))
  );

  type Group = {
    item: string;
    category: string;
    // Per-month total, so multiple charges in one month count as one sighting
    // (and the median reflects a month's total spend, not each transaction).
    byMonth: Map<string, number>;
    lastDate: string;
    expenseIds: number[];
  };

  const groups = new Map<string, Group>();

  entries.forEach((entry) => {
    if (!isSpendingKind(entry.kind)) return;
    const key = entryMonthKey(entry.date);
    if (!windowKeys.has(key)) return;

    const normalised = normaliseItem(entry.item);
    if (!normalised) return;

    let group = groups.get(normalised);
    if (!group) {
      group = {
        item: entry.item.trim(),
        category: entry.category,
        byMonth: new Map(),
        lastDate: entry.date,
        expenseIds: [],
      };
      groups.set(normalised, group);
    }

    group.byMonth.set(key, (group.byMonth.get(key) ?? 0) + entry.amount);
    group.expenseIds.push(entry.id);
    if (entry.date > group.lastDate) {
      group.lastDate = entry.date;
      group.item = entry.item.trim();
      group.category = entry.category;
    }
  });

  const results: SuspectedSubscription[] = [];

  groups.forEach((group, normalisedItem) => {
    if (activeTemplateNames.has(normalisedItem)) return;

    const monthlyTotals = Array.from(group.byMonth.values());
    const monthsSeen = monthlyTotals.length;
    if (monthsSeen < 3) return;

    const typical = median(monthlyTotals);
    if (typical <= 0) return;

    const withinTolerance = monthlyTotals.every(
      (amount) => Math.abs(amount - typical) <= typical * SIMILARITY_TOLERANCE
    );
    if (!withinTolerance) return;

    const typicalAmount = Math.round(typical);

    results.push({
      item: group.item,
      category: group.category,
      monthsSeen,
      typicalAmount,
      monthlyCost: typicalAmount,
      annualCost: typicalAmount * 12,
      lastDate: group.lastDate,
      expenseIds: group.expenseIds,
    });
  });

  results.sort((a, b) => b.annualCost - a.annualCost);

  return results;
}

function entryMonthKey(date: string) {
  return date.slice(0, 7);
}
