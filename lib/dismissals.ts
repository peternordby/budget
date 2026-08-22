"use client";

import { useCallback, useEffect, useState } from "react";

// Two things in the app are suggestions rather than facts, and both need a way
// to say "no, not this one":
//
//   subscription   — a recurring charge /innsikt spotted that was deliberately
//                    never registered as a fixed expense. Keyed by the
//                    normalised item name, since that is what the detection
//                    groups on.
//   missing-fixed  — a fixed expense that has not been booked this month and
//                    genuinely does not belong to it (an annual fee, a service
//                    that was paused). Keyed by template id *and* month: the
//                    same template is still expected every other month.
//
// This is a per-device preference, stored the same way the column order and
// the savings stack order are. Nothing here is derived data the app needs to
// agree on across devices — the worst case of a dismissal not syncing is a
// suggestion reappearing on the phone.
export const DISMISSALS_KEY = "budget.dismissals.v1";

export type DismissalKind = "subscription" | "missing-fixed";

export type Dismissals = Record<DismissalKind, string[]>;

const EMPTY: Dismissals = { subscription: [], "missing-fixed": [] };

export function missingFixedRef(templateId: number, monthKey: string) {
  return `${templateId}:${monthKey}`;
}

// The stored value is user-editable input like any other: a hand-edited or
// half-written localStorage entry must degrade to "nothing dismissed" rather
// than throw on a page that has nothing to do with dismissals.
export function parseDismissals(raw: string | null): Dismissals {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const read = (kind: DismissalKind) => {
      const value = (parsed as Record<string, unknown>)[kind];
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    };
    return { subscription: read("subscription"), "missing-fixed": read("missing-fixed") };
  } catch {
    return EMPTY;
  }
}

export function useDismissals() {
  const [dismissals, setDismissals] = useState<Dismissals>(EMPTY);

  // Client-only read: localStorage does not exist while the route shell is
  // prerendered, and reading during render would make the first paint differ
  // from the server's.
  useEffect(() => {
    try {
      setDismissals(parseDismissals(window.localStorage.getItem(DISMISSALS_KEY)));
    } catch {
      setDismissals(EMPTY);
    }
  }, []);

  const write = useCallback((next: Dismissals) => {
    setDismissals(next);
    try {
      window.localStorage.setItem(DISMISSALS_KEY, JSON.stringify(next));
    } catch {
      // A private window or full storage: the dismissal still applies for this
      // session, it just will not survive a reload.
    }
  }, []);

  const dismiss = useCallback(
    (kind: DismissalKind, ref: string) => {
      setDismissals((current) => {
        if (current[kind].includes(ref)) return current;
        const next = { ...current, [kind]: [...current[kind], ref] };
        try {
          window.localStorage.setItem(DISMISSALS_KEY, JSON.stringify(next));
        } catch {
          // See above.
        }
        return next;
      });
    },
    []
  );

  const restoreAll = useCallback(
    (kind: DismissalKind) => write({ ...dismissals, [kind]: [] }),
    [dismissals, write]
  );

  const isDismissed = useCallback(
    (kind: DismissalKind, ref: string) => dismissals[kind].includes(ref),
    [dismissals]
  );

  return { dismissals, isDismissed, dismiss, restoreAll };
}
