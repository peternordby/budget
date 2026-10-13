// The arithmetic behind /innsikt's period sections: the money calendar and the
// waterfall from income down to what is left. Pure over
// a LedgerEntry list already scoped to the selected months, so it is tested
// here rather than eyeballed in the page.

import { isIncomeKind, isSpendingKind } from "@/lib/categories";
import { SHORT_MONTH_NAMES } from "@/lib/format";
import type { LedgerEntry, MonthRef } from "@/lib/insights";

/** Compact amount with one decimal in thousands: 9 120 -> "9,1k", 253 -> "253". */
export function kiloAmount(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 1000) return String(rounded);
  return `${(rounded / 1000).toFixed(1).replace(".0", "").replace(".", ",")}k`;
}

export function daysInMonth(ref: MonthRef) {
  return new Date(ref.year, ref.month, 0).getDate();
}

/** Columns to skip before day 1 in a Monday-first week. */
export function mondayOffset(ref: MonthRef) {
  return (new Date(ref.year, ref.month - 1, 1).getDay() + 6) % 7;
}

/** "15. sep." — with the year when the period spans more than one. */
export function shortDate(date: string, withYear = false) {
  const [year, month, day] = date.split("-").map(Number);
  const base = `${day}. ${SHORT_MONTH_NAMES[month - 1]}.`;
  return withYear ? `${base} ${year}` : base;
}

/* ----------------------------------------------------------------- calendar */

/** How many of a day's purchases the calendar's tooltip lists. */
export const TOP_PER_DAY = 5;

export type CalendarDay = {
  date: string;
  /** Day of the month. */
  day: number;
  /** 0 = Monday. */
  weekday: number;
  spent: number;
  income: number;
  /** The day's largest spending entries, largest first, at most TOP_PER_DAY. */
  top: LedgerEntry[];
};

/** Every day of `months`, in order, with what went out and came in. */
export function calendarDays(entries: LedgerEntry[], months: MonthRef[]): CalendarDay[] {
  const days: CalendarDay[] = [];
  const byDate = new Map<string, CalendarDay>();
  const spending = new Map<string, LedgerEntry[]>();
  months.forEach((ref) => {
    const offset = mondayOffset(ref);
    for (let day = 1; day <= daysInMonth(ref); day += 1) {
      const date = `${ref.year}-${String(ref.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cell = { date, day, weekday: (offset + day - 1) % 7, spent: 0, income: 0, top: [] };
      days.push(cell);
      byDate.set(date, cell);
    }
  });
  entries.forEach((entry) => {
    const cell = byDate.get(entry.date);
    if (!cell) return;
    if (isIncomeKind(entry.kind)) cell.income += entry.amount;
    else if (isSpendingKind(entry.kind)) {
      cell.spent += entry.amount;
      spending.set(entry.date, [...(spending.get(entry.date) ?? []), entry]);
    }
  });
  spending.forEach((list, date) => {
    byDate.get(date)!.top = list.sort((a, b) => b.amount - a.amount).slice(0, TOP_PER_DAY);
  });
  return days;
}

/**
 * Average spending per weekday (Monday first) over the days that have
 * happened by `today` — a future Saturday is not a cheap one.
 */
export function weekdayAverages(days: CalendarDay[], today: string): number[] {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  days.forEach((day) => {
    if (day.date > today) return;
    sums[day.weekday] += day.spent;
    counts[day.weekday] += 1;
  });
  return sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
}

/** YYYY-MM-DD in local time. */
export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- waterfall */

export type WaterfallStep = {
  key: string;
  label: string;
  kind: "income" | "spend" | "rest";
  value: number;
  /** The running balance either side of the bar; `from` is the top for a step. */
  from: number;
  to: number;
};

/**
 * Income, then every spending category largest first, down to what is left.
 * Savings are not a step: money set aside is not spent, the same rule the
 * /oversikt difference and gauge follow, so it stays inside "Igjen".
 */
export function incomeWaterfall(entries: LedgerEntry[]): WaterfallStep[] {
  let income = 0;
  const byCategory = new Map<string, number>();
  entries.forEach((entry) => {
    if (isIncomeKind(entry.kind)) income += entry.amount;
    else if (isSpendingKind(entry.kind)) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    }
  });
  if (income <= 0) return [];

  const steps: WaterfallStep[] = [
    { key: "income", label: "Inntekt", kind: "income", value: income, from: 0, to: income },
  ];
  let running = income;
  [...byCategory]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, value]) => {
      steps.push({ key: category, label: category, kind: "spend", value, from: running, to: running - value });
      running -= value;
    });
  steps.push({ key: "rest", label: "Igjen", kind: "rest", value: running, from: 0, to: running });
  return steps;
}
