"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, type MonthRef } from "@/lib/insights";
import {
  keyToRef,
  parsePeriod,
  refToKey,
  serializePeriod,
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
  selectYear: (year: number) => void;
  /** Move the selection *and* the window by whole months. */
  shiftPeriod: (delta: number) => void;
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
      const months: string[] = [];
      for (let month = 1; month <= 12; month += 1) {
        months.push(refToKey({ year, month }));
      }
      // yearAnchor, not December: the picker's window overhangs its anchor, so
      // anchoring at December would draw April–March and hide a third of the
      // year that was just selected.
      write({ selected: months, anchor: yearAnchor(year) });
    },
    [write]
  );

  // The arrows move the period, not just the view: pressing ‹ used to scroll
  // the chart a month into the past and leave the selection where it was, so
  // every figure on the page stayed put and the button looked like it had done
  // nothing. Each selected month moves by the same delta, so a multi-month
  // selection keeps its size and a single month behaves as "previous/next".
  const shiftPeriod = useCallback(
    (delta: number) => {
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
    shiftPeriod,
    goToToday,
    bootstrap,
  };
}
