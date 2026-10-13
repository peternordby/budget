"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, type MonthRef } from "@/lib/insights";
import {
  keyToRef,
  parsePeriod,
  refToKey,
  selectionSpan,
  serializePeriod,
  toggleYear,
  wholeYears,
  yearAnchor,
  type PeriodState,
} from "@/lib/period";

export type PeriodApi = {
  selectedKeys: Set<string>;
  selectedList: MonthRef[];
  /** The single selected month, or null when zero or many are selected. */
  single: MonthRef | null;
  anchor: MonthRef;
  /** False until the URL carries an explicit selection. */
  ready: boolean;
  selectMonth: (ref: MonthRef, additive: boolean) => void;
  /** A year chip: just that year, or add/remove it while whole years are selected. */
  selectYear: (year: number) => void;
  /** Select an explicit set of month keys (the picker's "Alle"). */
  selectMonths: (keys: string[]) => void;
  /** Move the selection *and* the window back (-1) or forward (1) by its own span. */
  shiftPeriod: (direction: -1 | 1) => void;
  /** Select this month and scroll the window back to it. */
  goToToday: () => void;
  bootstrap: (ref: MonthRef) => void;
};

export function usePeriod(fallback: MonthRef): PeriodApi {
  const router = useRouter();
  const params = useSearchParams();

  const p = params.get("p");
  const w = params.get("w");

  const state = useMemo(() => parsePeriod(p, w, fallback), [p, w, fallback.year, fallback.month]);

  // replace, not push: period changes are view adjustments, and pushing would
  // bury the previous page under a dozen history entries after a few clicks.
  const write = useCallback(
    (next: PeriodState) => {
      const { p: nextP, w: nextW } = serializePeriod(next);
      router.replace(`?p=${nextP}&w=${nextW}`, { scroll: false });
    },
    [router]
  );

  const selectedKeys = useMemo(() => new Set(state.selected), [state.selected]);
  const selectedList = useMemo(() => state.selected.map(keyToRef), [state.selected]);
  const single = selectedList.length === 1 ? selectedList[0] : null;

  const selectMonth = useCallback(
    (ref: MonthRef, additive: boolean) => {
      const key = refToKey(ref);
      if (!additive) {
        write({ selected: [key], anchor: state.anchor });
        return;
      }
      const next = new Set(state.selected);
      if (next.has(key)) {
        // Always keep at least one month selected.
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      write({ selected: Array.from(next).sort(), anchor: state.anchor });
    },
    [state.selected, state.anchor, write]
  );

  const selectYear = useCallback(
    (year: number) => {
      const selected = toggleYear(state.selected, year);
      const years = wholeYears(selected) ?? [year];
      // yearAnchor, not December: the picker's window overhangs its anchor, so
      // anchoring at December would draw April–March and hide a third of the
      // year that was just selected. The year pressed is the one shown, unless
      // pressing it took it away — then the newest year left.
      const shown = years.includes(year) ? year : years[years.length - 1];
      write({ selected, anchor: yearAnchor(shown) });
    },
    [state.selected, write]
  );

  const selectMonths = useCallback(
    (keys: string[]) => {
      if (!keys.length) return;
      const sorted = Array.from(new Set(keys)).sort();
      // Anchor on the newest month so the chart lands where the data is.
      write({ selected: sorted, anchor: keyToRef(sorted[sorted.length - 1]) });
    },
    [write]
  );

  // The arrows move the period, not just the view: pressing ‹ used to scroll
  // the chart a month into the past and leave the selection where it was, so
  // every figure on the page stayed put and the button looked like it had done
  // nothing. The step is the selection's own span (lib/period.ts,
  // selectionSpan): a month steps a month, a year a year — a one-month step
  // turned January–December into February–January.
  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      const delta = direction * selectionSpan(state.selected);
      write({
        selected: state.selected
          .map((key) => refToKey(addMonths(keyToRef(key), delta)))
          .sort(),
        anchor: addMonths(state.anchor, delta),
      });
    },
    [state.selected, state.anchor, write]
  );

  // Selection *and* anchor, which is what "I dag" means: it used to move only
  // the window, so pressing it while a whole year was selected scrolled the
  // chart back to today and left all twelve months selected — every figure on
  // the page still annual, with no obvious way back to a single month. It also
  // deliberately does not go through selectMonth, which preserves the anchor.
  const goToToday = useCallback(() => {
    write({ selected: [refToKey(fallback)], anchor: fallback });
  }, [fallback.year, fallback.month, write]);

  const bootstrap = useCallback(
    (ref: MonthRef) => {
      // Only ever fills an empty URL. A user who linked to a period must never
      // have it overwritten by the "latest month with data" default.
      if (p) return;
      write({ selected: [refToKey(ref)], anchor: ref });
    },
    [p, write]
  );

  return {
    selectedKeys,
    selectedList,
    single,
    anchor: state.anchor,
    ready: Boolean(p),
    selectMonth,
    selectYear,
    selectMonths,
    shiftPeriod,
    goToToday,
    bootstrap,
  };
}
