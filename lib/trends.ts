// Pure trend calculations for the /innsikt "where does the money go" view:
// per-category series over a month window, and the fixed/variable/savings mix
// of an average month. No I/O, no React.
//
// This file used to export `fixedVariableSplit` (a stacked column of fixed vs.
// variable per month) and `savingsRate`. Both were removed: the column chart
// showed the split without saying anything about it, and the savings rate was
// a percentage nobody acted on. `spendingMix` below is the fixed/variable
// question asked so that it has an answer — what is committed before any
// choice is made, what is left after it, and whether the committed part is
// creeping upward.

import {
  isIncomeKind,
  isSavingsKind,
  isSpendingKind,
  type CategoryKind,
} from "@/lib/categories";
import {
  monthKey,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";

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
// savings), zero-filled and
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

export type MixPoint = {
  key: string;
  income: number;
  fixed: number;
  variable: number;
  savings: number;
};

// Per-month income and the three ways money leaves: committed (fixed),
// discretionary (variable), and put aside (savings). Zero-filled and aligned
// to `months`, like every other series here.
export function spendingMix(
  entries: LedgerEntry[],
  months: MonthRef[]
): MixPoint[] {
  const monthKeys = months.map((ref) => monthKey(ref.year, ref.month));
  const points = new Map<string, MixPoint>(
    monthKeys.map((key) => [
      key,
      { key, income: 0, fixed: 0, variable: 0, savings: 0 },
    ])
  );

  entries.forEach((entry) => {
    const point = points.get(entryMonthKey(entry));
    if (!point) return;
    if (isIncomeKind(entry.kind)) {
      point.income += entry.amount;
    } else if (isSavingsKind(entry.kind)) {
      point.savings += entry.amount;
    } else if (entry.kind === "fixed") {
      point.fixed += entry.amount;
    } else {
      point.variable += entry.amount;
    }
  });

  return monthKeys.map((key) => points.get(key)!);
}

export type MixTrend = {
  // Mean fixed cost in the older half of the window and in the newer half,
  // and the difference between them.
  previous: number;
  recent: number;
  delta: number;
  months: number;
};

export type MixSummary = {
  months: number;
  income: number;
  fixed: number;
  variable: number;
  savings: number;
  // What the bar is drawn against. Income when it covers the outgoings, the
  // outgoings themselves when it does not — so the bar always totals 100%
  // whether the window overspent or had no registered income at all, and
  // `leftover` never has to be negative.
  base: number;
  leftover: number;
  // Fixed cost as a share of income, or null when there is no income to be a
  // share of. Null rather than 0: "no income registered" is not "0 % locked
  // in", it is a question the data cannot answer.
  fixedShareOfIncome: number | null;
  // Income minus fixed cost: what an average month has to work with once the
  // unavoidable part is paid. Null for the same reason.
  headroom: number | null;
  trend: MixTrend | null;
};

// Averages over the window, plus the older-half/newer-half comparison that
// catches a fixed cost creeping upward — the failure mode a per-month chart
// makes you eyeball and usually miss.
export function mixSummary(points: MixPoint[]): MixSummary {
  const months = points.length;
  if (!months) {
    return {
      months: 0,
      income: 0,
      fixed: 0,
      variable: 0,
      savings: 0,
      base: 0,
      leftover: 0,
      fixedShareOfIncome: null,
      headroom: null,
      trend: null,
    };
  }

  const sum = (pick: (point: MixPoint) => number) =>
    points.reduce((total, point) => total + pick(point), 0) / months;

  const income = sum((point) => point.income);
  const fixed = sum((point) => point.fixed);
  const variable = sum((point) => point.variable);
  const savings = sum((point) => point.savings);
  const outgoings = fixed + variable + savings;
  const base = Math.max(income, outgoings);

  // A window too short to have two halves cannot show a trend. Four months is
  // the floor: two against two is already thin, and one against one is noise
  // dressed up as a direction.
  let trend: MixTrend | null = null;
  if (months >= 4) {
    const half = Math.floor(months / 2);
    const meanFixed = (slice: MixPoint[]) =>
      slice.reduce((total, point) => total + point.fixed, 0) / slice.length;
    // An odd month count drops the middle month rather than letting it lean on
    // one side and tilt the comparison.
    const previous = meanFixed(points.slice(0, half));
    const recent = meanFixed(points.slice(months - half));
    trend = { previous, recent, delta: recent - previous, months: half };
  }

  return {
    months,
    income,
    fixed,
    variable,
    savings,
    base,
    leftover: Math.max(base - outgoings, 0),
    fixedShareOfIncome: income > 0 ? fixed / income : null,
    headroom: income > 0 ? income - fixed : null,
    trend,
  };
}
