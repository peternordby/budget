// Pure analytics helpers for month-over-month insights and anomaly detection.
// All functions operate on a normalized LedgerEntry list (typically a trailing
// 12-month window) so the UI can derive insights without extra queries.

import {
  isIncomeKind,
  isSavingsKind,
  isSpendingKind,
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

export type CategoryMover = {
  category: string;
  current: number;
  previous: number;
  delta: number;
  pct: number | null;
};

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

/**
 * The months a selection is compared against: the same shape, shifted back by
 * its own length. One month compares with the month before it; a whole year
 * with the same twelve months a year earlier; four months with the four before
 * them. A gappy Ctrl-click selection keeps its gaps.
 */
export function previousPeriod(selected: MonthRef[]): MonthRef[] {
  return selected.map((ref) => addMonths(ref, -selected.length));
}

export type MonthComparison = {
  current: PeriodTotal;
  previous: PeriodTotal;
  expensePct: number | null;
  incomePct: number | null;
  movers: CategoryMover[];
};

/**
 * Compares a selected period with the one before it (see previousPeriod).
 * Takes a list rather than a single month because the period picker can select
 * a whole year, and "sammenlignet med forrige måned" over twelve selected
 * months compared December with November and called it the year.
 */
export function compareMonths(
  entries: LedgerEntry[],
  selected: MonthRef[]
): MonthComparison | null {
  if (!selected.length) return null;
  const prevRefs = previousPeriod(selected);
  const current = sumMonths(aggregateByMonth(entries, selected));
  const previous = sumMonths(aggregateByMonth(entries, prevRefs));
  if (previous.count === 0 && current.count === 0) return null;

  const currentKeys = new Set(selected.map((ref) => monthKey(ref.year, ref.month)));
  const previousKeys = new Set(prevRefs.map((ref) => monthKey(ref.year, ref.month)));
  const currentByCategory = new Map<string, number>();
  const previousByCategory = new Map<string, number>();

  entries.forEach((entry) => {
    if (!isSpendingKind(entry.kind)) return;
    const key = entryMonthKey(entry);
    if (currentKeys.has(key)) {
      currentByCategory.set(
        entry.category,
        (currentByCategory.get(entry.category) ?? 0) + entry.amount
      );
    } else if (previousKeys.has(key)) {
      previousByCategory.set(
        entry.category,
        (previousByCategory.get(entry.category) ?? 0) + entry.amount
      );
    }
  });

  const categories = new Set([
    ...currentByCategory.keys(),
    ...previousByCategory.keys(),
  ]);
  const movers: CategoryMover[] = [];
  categories.forEach((category) => {
    const currentTotal = currentByCategory.get(category) ?? 0;
    const previousTotal = previousByCategory.get(category) ?? 0;
    const delta = currentTotal - previousTotal;
    if (delta === 0) return;
    movers.push({
      category,
      current: currentTotal,
      previous: previousTotal,
      delta,
      pct: previousTotal > 0 ? (delta / previousTotal) * 100 : null,
    });
  });
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    current,
    previous,
    expensePct:
      previous.expenses > 0
        ? ((current.expenses - previous.expenses) / previous.expenses) * 100
        : null,
    incomePct:
      previous.income > 0
        ? ((current.income - previous.income) / previous.income) * 100
        : null,
    movers: movers.slice(0, 5),
  };
}

export type Anomaly =
  | {
      kind: "large-transaction";
      severity: "warn" | "bad";
      entry: LedgerEntry;
      median: number;
      ratio: number;
    }
  | {
      kind: "category-spike";
      severity: "warn" | "bad";
      category: string;
      current: number;
      average: number;
      ratio: number;
    }
  | {
      kind: "new-category";
      severity: "info";
      category: string;
      total: number;
    }
  | {
      kind: "duplicate";
      severity: "warn";
      item: string;
      amount: number;
      date: string;
      count: number;
    }
  | {
      kind: "missing-fixed";
      severity: "warn";
      item: string;
      amount: number;
    };

// A fixed expense the caller expects to see booked in the selected month.
// Deliberately not RecurringTemplate: which templates are due is a calendar
// question the caller already answers, and this module stays free of it.
export type ExpectedFixed = { item: string; amount: number };

export function anomalyKey(anomaly: Anomaly): string {
  switch (anomaly.kind) {
    case "large-transaction":
      return `tx-${anomaly.entry.id}`;
    case "category-spike":
      return `spike-${anomaly.category}`;
    case "new-category":
      return `new-${anomaly.category}`;
    case "duplicate":
      return `dup-${anomaly.date}-${anomaly.item}-${anomaly.amount}`;
    case "missing-fixed":
      return `missing-${anomaly.item}`;
  }
}

const MIN_SAMPLES = 5;
const MIN_TRANSACTION_AMOUNT = 300;
// Serves two distinct roles that happen to share a threshold today: the
// first-appearance reporting floor for "new-category", and the minimum
// absolute krone gap above history required for "category-spike". Keep them
// unified for now — splitting this into two constants is a behaviour-neutral
// refactor for later, not something to do incidentally here.
const MIN_SPIKE_DIFF = 500;

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

function stdDev(values: number[], valueMean: number) {
  const variance =
    values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

// The kroner at stake in one anomaly — what makes one worth reading before
// another of the same severity. A spike is worth its excess over the average,
// not its total: a 12 000 kr category that ran 1 000 kr hot is a smaller
// finding than a 3 000 kr one that doubled.
function anomalyMagnitude(anomaly: Anomaly): number {
  switch (anomaly.kind) {
    case "large-transaction":
      return anomaly.entry.amount;
    case "category-spike":
      return anomaly.current - anomaly.average;
    case "new-category":
      return anomaly.total;
    case "duplicate":
      return anomaly.amount * (anomaly.count - 1);
    case "missing-fixed":
      return anomaly.amount;
  }
}

export function detectAnomalies(
  entries: LedgerEntry[],
  selected: MonthRef,
  expectedFixed: ExpectedFixed[] = []
): Anomaly[] {
  const selectedKey = monthKey(selected.year, selected.month);
  const allExpenses = entries.filter((entry) => isSpendingKind(entry.kind));
  const selectedExpenses = allExpenses.filter(
    (entry) => entryMonthKey(entry) === selectedKey
  );
  const anomalies: Anomaly[] = [];

  // 1. Single transactions far above the category's typical amount.
  //
  // The baseline excludes the transaction being judged. Including it made the
  // rule mathematically unable to fire on a small sample: with n amounts, one
  // outlier can reach at most (n-1)/sqrt(n-1) standard deviations above the
  // mean it is itself part of, which is under 2 for n = 5 — exactly
  // MIN_SAMPLES. So the very cases the rule exists for (one big charge among a
  // handful of small ones) were silently unreportable, and the rule only ever
  // fired once a category had a long history.
  const byCategory = new Map<string, LedgerEntry[]>();
  allExpenses.forEach((entry) => {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  });
  selectedExpenses.forEach((entry) => {
    const others = (byCategory.get(entry.category) ?? [])
      .filter((candidate) => candidate.id !== entry.id)
      .map((candidate) => candidate.amount);
    if (others.length < MIN_SAMPLES) return;
    const amountMean = mean(others);
    const amountStd = stdDev(others, amountMean);
    const amountMedian = median(others);
    if (amountStd === 0 || amountMedian <= 0) return;
    const ratio = entry.amount / amountMedian;
    if (
      entry.amount >= MIN_TRANSACTION_AMOUNT &&
      entry.amount > amountMean + 2 * amountStd &&
      ratio >= 2
    ) {
      anomalies.push({
        kind: "large-transaction",
        severity: entry.amount > amountMean + 3 * amountStd ? "bad" : "warn",
        entry,
        median: amountMedian,
        ratio,
      });
    }
  });

  // 2. Category totals well above the category's historic monthly average,
  //    plus categories that appear for the first time in the window.
  const monthlyByCategory = new Map<string, Map<string, number>>();
  allExpenses.forEach((entry) => {
    const key = entryMonthKey(entry);
    let inner = monthlyByCategory.get(entry.category);
    if (!inner) {
      inner = new Map();
      monthlyByCategory.set(entry.category, inner);
    }
    inner.set(key, (inner.get(key) ?? 0) + entry.amount);
  });
  monthlyByCategory.forEach((byMonth, category) => {
    const current = byMonth.get(selectedKey) ?? 0;
    if (current <= 0) return;
    const history = Array.from(byMonth.entries())
      .filter(([key]) => key !== selectedKey)
      .map(([, total]) => total)
      .filter((total) => total > 0);

    if (history.length === 0) {
      if (current >= MIN_SPIKE_DIFF) {
        anomalies.push({
          kind: "new-category",
          severity: "info",
          category,
          total: current,
        });
      }
      return;
    }

    if (history.length < 3) return;
    const average = mean(history);
    const ratio = current / average;
    if (ratio >= 1.5 && current - average >= MIN_SPIKE_DIFF) {
      anomalies.push({
        kind: "category-spike",
        severity: ratio >= 2.5 ? "bad" : "warn",
        category,
        current,
        average,
        ratio,
      });
    }
  });

  // 3. Possible duplicates: identical item, amount and date in the month.
  const duplicateGroups = new Map<string, LedgerEntry[]>();
  selectedExpenses.forEach((entry) => {
    const key = `${entry.date}|${entry.item.trim().toLowerCase()}|${entry.amount}`;
    const list = duplicateGroups.get(key) ?? [];
    list.push(entry);
    duplicateGroups.set(key, list);
  });
  duplicateGroups.forEach((group) => {
    if (group.length < 2) return;
    const [first] = group;
    anomalies.push({
      kind: "duplicate",
      severity: "warn",
      item: first.item,
      amount: first.amount,
      date: first.date,
      count: group.length,
    });
  });

  // 4. Fixed expenses the caller expected this month that never showed up.
  // Matched on the normalised item name, the same key autocomplete and
  // subscription detection group by.
  const bookedItems = new Set(
    selectedExpenses.map((entry) => entry.item.trim().toLowerCase())
  );
  expectedFixed.forEach((expected) => {
    if (bookedItems.has(expected.item.trim().toLowerCase())) return;
    anomalies.push({
      kind: "missing-fixed",
      severity: "warn",
      item: expected.item,
      amount: expected.amount,
    });
  });

  // Severity first, then size within a severity: the list is read top-down and
  // acted on, so the 4 000 kr surprise has to come before the 600 kr one. Sort
  // was severity-only, which left the order to however the rules happened to
  // run — by category insertion order, in practice.
  const severityRank = { bad: 0, warn: 1, info: 2 } as const;
  anomalies.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      anomalyMagnitude(b) - anomalyMagnitude(a)
  );
  return anomalies;
}
