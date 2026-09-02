// The selected period lives in the URL so every view is linkable, survives a
// reload, and gives back/forward the meaning the user expects. That makes the
// URL user-editable input: every parse tolerates garbage rather than throwing.

import { addMonths, listWindowMonths, monthKey, type MonthRef } from "@/lib/insights";
import { MONTH_NAMES, monthLabel } from "@/lib/format";

export type PeriodState = {
  /** Sorted ascending, always at least one entry. */
  selected: string[];
  /** The trailing-window anchor the chart is drawn around. */
  anchor: MonthRef;
};

const MONTH_KEY = /^\d{4}-\d{2}$/;

export function isMonthKey(value: string) {
  if (!MONTH_KEY.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function keyToRef(key: string): MonthRef {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

export function refToKey(ref: MonthRef) {
  return monthKey(ref.year, ref.month);
}

export function parsePeriod(
  p: string | null,
  w: string | null,
  fallback: MonthRef
): PeriodState {
  const selected = Array.from(
    new Set(
      (p ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(isMonthKey)
    )
  ).sort();

  const resolved = selected.length ? selected : [refToKey(fallback)];

  const anchorRaw = (w ?? "").trim();
  // No usable anchor: sit the chart on the newest selected month rather than
  // on today, so a shared link shows what the sender was looking at.
  const anchor = isMonthKey(anchorRaw)
    ? keyToRef(anchorRaw)
    : keyToRef(resolved[resolved.length - 1]);

  return { selected: resolved, anchor };
}

export function serializePeriod(state: PeriodState) {
  return { p: state.selected.join(","), w: refToKey(state.anchor) };
}

/**
 * Human label for a period selection: "mars 2026", "2026", "4 måneder 2026",
 * "7 måneder valgt".
 *
 * Lived inline in `app/(app)/oversikt/page.tsx`, with its own hard-coded list of
 * Norwegian month names beside `lib/format.ts`'s. It moved here when /innsikt
 * grew the two month-comparison sections that also have to name the period they
 * cover — two copies of this would drift on the first wording change.
 */
export function periodLabel(selected: MonthRef[]) {
  if (!selected.length) return "Ingen periode";
  if (selected.length === 1) {
    return monthLabel(selected[0].year, selected[0].month);
  }
  const years = new Set(selected.map((ref) => ref.year));
  if (years.size === 1) {
    const year = selected[0].year;
    if (selected.length === 12) return String(year);
    return `${selected.length} måneder ${year}`;
  }
  return `${selected.length} måneder valgt`;
}

/**
 * Label for an analysis window: "Siste 12 måneder · sep 2025–aug 2026".
 *
 * The month count is read off the list rather than off the caller's constant,
 * because `useAnalysisWindow` clamps to what has actually been fetched — a
 * heading that promised twelve months over a chart drawing seven was the bug
 * this replaces. The dates are month names, not the raw `2025-09` keys the two
 * callers each formatted for themselves; the year is stated once when the
 * window sits inside one.
 */
export function windowLabel(months: MonthRef[]) {
  if (!months.length) return "";
  return `Siste ${months.length} måneder · ${monthRangeLabel(months)}`;
}

/** Just the span: "mar–aug 2026", or "sep 2025–aug 2026" across a year end. */
export function monthRangeLabel(months: MonthRef[]) {
  if (!months.length) return "";
  const first = months[0];
  const last = months[months.length - 1];
  // The first three letters of every Norwegian month name are its standard
  // abbreviation, so there is no second table to keep in step with MONTH_NAMES.
  const short = (ref: MonthRef) => MONTH_NAMES[ref.month - 1].slice(0, 3);
  if (first.year === last.year) {
    if (first.month === last.month) return `${short(first)} ${last.year}`;
    return `${short(first)}–${short(last)} ${last.year}`;
  }
  return `${short(first)} ${first.year}–${short(last)} ${last.year}`;
}

/* --- The period picker's 12-month window -----------------------------------
 *
 * Not a trailing window: it reaches three months past the anchor, because the
 * picker is also how you get to a month you are *planning* — a budget is set
 * before the month starts, and the year buttons already offer next year for the
 * same reason. Eight months of history is still enough to see a pattern.
 *
 * The shape lives here rather than in the component because `selectYear` needs
 * it too: with a window that overhangs the anchor, anchoring a whole-year
 * selection at December would draw April to March and cut three months off the
 * year the user just picked.
 */

export const WINDOW_BEFORE = 8;
export const WINDOW_AFTER = 3;
export const WINDOW_LENGTH = WINDOW_BEFORE + 1 + WINDOW_AFTER;

/** The months the picker draws for a given anchor, oldest first. */
export function chartWindow(anchor: MonthRef): MonthRef[] {
  return listWindowMonths(addMonths(anchor, WINDOW_AFTER), WINDOW_LENGTH);
}

/** The anchor whose window is exactly January–December of `year`. */
export function yearAnchor(year: number): MonthRef {
  return { year, month: 12 - WINDOW_AFTER };
}
