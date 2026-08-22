// The selected period lives in the URL so every view is linkable, survives a
// reload, and gives back/forward the meaning the user expects. That makes the
// URL user-editable input: every parse tolerates garbage rather than throwing.

import { monthKey, type MonthRef } from "@/lib/insights";

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
