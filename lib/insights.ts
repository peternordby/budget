// Pure analytics helpers: month keys and per-month aggregation.
// All functions operate on a normalized LedgerEntry list (typically a trailing
// 12-month window) so the UI can derive insights without extra queries.

import {
  isIncomeKind,
  isSavingsKind,
  type CategoryKind,
} from "@/lib/categories";

export type LedgerEntry = {
  id: number;
  item: string;
  amount: number;
  category: string;
  kind: CategoryKind;
  date: string; // YYYY-MM-DD
  tag: string | null;
};

export type MonthRef = { year: number; month: number };

export type MonthlyTotal = MonthRef & {
  key: string;
  income: number;
  expenses: number;
  savings: number;
  net: number;
  count: number;
};

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function previousMonth(ref: MonthRef): MonthRef {
  if (ref.month === 1) {
    return { year: ref.year - 1, month: 12 };
  }
  return { year: ref.year, month: ref.month - 1 };
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const total = ref.year * 12 + (ref.month - 1) + delta;
  const year = Math.floor(total / 12);
  return { year, month: total - year * 12 + 1 };
}

export function listWindowMonths(anchor: MonthRef, count = 12): MonthRef[] {
  const months: MonthRef[] = [];
  let cursor: MonthRef = { year: anchor.year, month: anchor.month };
  for (let i = 0; i < count; i += 1) {
    months.unshift(cursor);
    cursor = previousMonth(cursor);
  }
  return months;
}

function entryMonthKey(entry: LedgerEntry) {
  return entry.date.slice(0, 7);
}

export function aggregateByMonth(
  entries: LedgerEntry[],
  months: MonthRef[]
): MonthlyTotal[] {
  const byKey = new Map<string, MonthlyTotal>();
  months.forEach((ref) => {
    const key = monthKey(ref.year, ref.month);
    byKey.set(key, {
      ...ref,
      key,
      income: 0,
      expenses: 0,
      savings: 0,
      net: 0,
      count: 0,
    });
  });

  entries.forEach((entry) => {
    const bucket = byKey.get(entryMonthKey(entry));
    if (!bucket) return;
    if (isIncomeKind(entry.kind)) {
      bucket.income += entry.amount;
    } else if (isSavingsKind(entry.kind)) {
      bucket.savings += entry.amount;
    } else {
      bucket.expenses += entry.amount;
    }
    bucket.count += 1;
  });

  byKey.forEach((bucket) => {
    bucket.net = bucket.income - bucket.expenses;
  });

  return months.map((ref) => byKey.get(monthKey(ref.year, ref.month))!);
}

/** The same figures as MonthlyTotal, summed over a set of months. */
export type PeriodTotal = {
  income: number;
  expenses: number;
  savings: number;
  net: number;
  count: number;
};

export function sumMonths(totals: MonthlyTotal[]): PeriodTotal {
  return totals.reduce<PeriodTotal>(
    (sum, month) => ({
      income: sum.income + month.income,
      expenses: sum.expenses + month.expenses,
      savings: sum.savings + month.savings,
      net: sum.net + month.net,
      count: sum.count + month.count,
    }),
    { income: 0, expenses: 0, savings: 0, net: 0, count: 0 }
  );
}
