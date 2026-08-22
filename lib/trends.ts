// Pure trend calculations for the /innsikt "where does the money go" view:
// per-category series over a month window, the fixed-vs-variable split, and
// the savings rate. No I/O, no React.

import {
  aggregateByMonth,
  monthKey,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import { isSpendingKind, type CategoryKind } from "@/lib/categories";

function entryMonthKey(entry: LedgerEntry) {
  return entry.date.slice(0, 7);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type CategorySeries = {
  category: string;
  kind: CategoryKind;
  points: number[];
  total: number;
  mean: number;
  median: number;
};

// One series per spending category (fixed and variable, never income or
// savings — those are reported separately by savingsRate), zero-filled and
// aligned to `months`. Pass `includeAllKinds: true` to bucket every
// category regardless of kind — /innsikt's "where does the money go" chart
// needs the spending-only default; a general category detail view (the
// drill-down panel) needs every kind, since suppressing income/savings rows
// there would either render a false all-zero chart for a real category or
// require hiding the row's click entirely, which is its own confusion in a
// list where every other row is live.
export function categorySeries(
  entries: LedgerEntry[],
  months: MonthRef[],
  options: { includeAllKinds?: boolean } = {}
): CategorySeries[] {
  const { includeAllKinds = false } = options;
  const monthKeys = months.map((ref) => monthKey(ref.year, ref.month));
  const monthIndex = new Map(monthKeys.map((key, index) => [key, index]));

  const byCategory = new Map<
    string,
    { kind: CategoryKind; points: number[] }
  >();

  entries.forEach((entry) => {
    if (!includeAllKinds && !isSpendingKind(entry.kind)) return;
    const index = monthIndex.get(entryMonthKey(entry));
    if (index === undefined) return;
    let bucket = byCategory.get(entry.category);
    if (!bucket) {
      bucket = { kind: entry.kind, points: monthKeys.map(() => 0) };
      byCategory.set(entry.category, bucket);
    }
    bucket.points[index] += entry.amount;
  });

  const series: CategorySeries[] = Array.from(byCategory.entries()).map(
    ([category, bucket]) => {
      const total = bucket.points.reduce((sum, value) => sum + value, 0);
      return {
        category,
        kind: bucket.kind,
        points: bucket.points,
        total,
        mean: mean(bucket.points),
        median: median(bucket.points),
      };
    }
  );

  series.sort((a, b) => b.total - a.total);
  return series;
}

export type SplitPoint = { key: string; fixed: number; variable: number };

// One point per month, zero-filled, splitting spending into fixed vs.
// variable. Income and savings never appear.
export function fixedVariableSplit(
  entries: LedgerEntry[],
  months: MonthRef[]
): SplitPoint[] {
  const monthKeys = months.map((ref) => monthKey(ref.year, ref.month));
  const points = new Map<string, SplitPoint>(
    monthKeys.map((key) => [key, { key, fixed: 0, variable: 0 }])
  );

  entries.forEach((entry) => {
    if (!isSpendingKind(entry.kind)) return;
    const point = points.get(entryMonthKey(entry));
    if (!point) return;
    if (entry.kind === "fixed") {
      point.fixed += entry.amount;
    } else {
      point.variable += entry.amount;
    }
  });

  return monthKeys.map((key) => points.get(key)!);
}

export type SavingsPoint = {
  key: string;
  income: number;
  net: number;
  savings: number;
  rate: number | null;
};

// One point per month: income, net (income minus spending, savings
// transfers excluded), the savings total, and the savings rate (net /
// income). `rate` is null rather than 0 when a month has no income — zero
// would falsely claim "saved nothing" instead of "cannot say".
export function savingsRate(
  entries: LedgerEntry[],
  months: MonthRef[]
): SavingsPoint[] {
  const totals = aggregateByMonth(entries, months);
  return totals.map((total) => ({
    key: total.key,
    income: total.income,
    net: total.net,
    savings: total.savings,
    rate: total.income === 0 ? null : total.net / total.income,
  }));
}
