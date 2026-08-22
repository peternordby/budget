"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, type MonthRef } from "@/lib/insights";
import {
  keyToRef,
  parsePeriod,
  refToKey,
  serializePeriod,
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
  shiftAnchor: (delta: number) => void;
  resetAnchor: () => void;
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
      write({ selected: months, anchor: { year, month: 12 } });
    },
    [write]
  );

  const shiftAnchor = useCallback(
    (delta: number) => {
      write({ selected: state.selected, anchor: addMonths(state.anchor, delta) });
    },
    [state.selected, state.anchor, write]
  );

  const resetAnchor = useCallback(() => {
    write({ selected: state.selected, anchor: fallback });
  }, [state.selected, fallback.year, fallback.month, write]);

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
    shiftAnchor,
    resetAnchor,
    bootstrap,
  };
}
