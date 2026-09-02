"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  useAnalysisWindow,
  useLedger,
  useLedgerSelection,
  toLedgerEntries,
} from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { categorySeries } from "@/lib/trends";
import { monthKey, type MonthRef } from "@/lib/insights";
import { windowLabel as formatWindowLabel } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/format";
import { IconX } from "@/components/icons";
import MonthColumns, { type MonthPoint } from "@/components/MonthColumns";
import { T_BASE } from "@/lib/motion";
import styles from "./CategoryDrilldown.module.css";

const SHORT_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "mai",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "des",
];

// Same twelve-month history /innsikt's category tiles use, so a tile and the
// panel it opens report the same Snitt and Median.
const ANALYSIS_MONTHS = 12;

type CategoryDrilldownProps = {
  category: string | null;
  onClose: () => void;
  /** The host route's period anchor, straight from its own usePeriod. The
   *  panel must analyse the same months the route it lives on does, so the
   *  anchor is threaded in rather than re-derived here. */
  anchor: MonthRef;
};

// A panel, not a route: the category cards on /innsikt and the category rows
// on /oversikt both set the same piece of state and render this from it,
// rather than each reconstructing the category's history on its own page.
export default function CategoryDrilldown({
  category,
  onClose,
  anchor,
}: CategoryDrilldownProps) {
  const ledger = useLedger();

  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  // Destructured immediately, per usePeriod's contract: it returns a fresh
  // object every render, so only selectedKeys (used to scope the
  // transaction list to the current selection) is kept.
  const { selectedKeys } = usePeriod(fallback);
  const selectionExpenses = useLedgerSelection(selectedKeys);

  const isOpen = category !== null;

  const panelRef = useRef<HTMLDivElement | null>(null);
  // Holds whatever had focus when the panel most recently opened (or moved
  // to a different category while already open), so it can be restored when
  // the panel closes. Losing focus to <body> instead would restart tabbing
  // at the top of the page — the activity table's inline row editor
  // (app/(app)/transaksjoner/page.tsx, focusExpenseRow) hit exactly this bug
  // and explicitly restores focus to the element that replaces what
  // unmounted; here the trigger never unmounts, so capturing
  // document.activeElement at open time and refocusing it at close time is
  // enough.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  // Keeps the escape/outside-click listeners from having to depend on
  // onClose directly (a new function identity every render from both
  // callers), so they don't re-subscribe on every render.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      // Captures the trigger button on first open, and re-captures it if the
      // caller switches categories directly (one card to another) without
      // the panel ever closing in between.
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else if (wasOpenRef.current) {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [category]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      // The trigger is not "outside" for this purpose. Without this guard a
      // second click on the same category tile closed the panel here on
      // mousedown and the tile's own click handler — which toggles — then saw
      // a null category and reopened it, so the panel never closed.
      if (restoreFocusRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  // Trailing twelve months ending at the host's selected month, clamped to the
  // fetched range — the same hook app/(app)/innsikt/page.tsx uses, so both
  // consumers of categorySeries bucket the same way, and neither divides by a
  // window the period picker happened to widen. See useAnalysisWindow in
  // components/LedgerProvider.tsx.
  const months = useAnalysisWindow(anchor, ANALYSIS_MONTHS);

  // Shared with /innsikt's section headers: the label states the window the
  // bars actually cover, which useAnalysisWindow clamps to the fetched range.
  const windowLabel = useMemo(() => formatWindowLabel(months), [months]);

  const entries = useMemo(
    () => toLedgerEntries(ledger.expenses),
    [ledger.expenses]
  );

  // Reuses the same bucketing categorySeries already does for /innsikt's
  // small multiples, filtered down to the one category, instead of
  // re-deriving the month bucketing here. This panel is a general category
  // detail view (reachable from /oversikt's rows for every kind, not just
  // spending), so it opts into includeAllKinds — the default stays
  // spending-only for /innsikt, which must not gain income/savings cards.
  const series = useMemo(
    () => categorySeries(entries, months, { includeAllKinds: true }),
    [entries, months]
  );
  const data = useMemo(
    () => (category ? series.find((entry) => entry.category === category) ?? null : null),
    [series, category]
  );

  // With includeAllKinds set, every category with at least one entry in the
  // window gets a bucket. `data` is only null for a category that has never
  // had a single transaction (e.g. a freshly created, unused category) —
  // fall back to zero-filled bars rather than throwing; the transaction
  // list below still reflects the real entries regardless.
  const points = data ? data.points : months.map(() => 0);
  const mean = data ? data.mean : 0;
  const median = data ? data.median : 0;

  const budgetByMonth = useMemo(() => {
    const map = new Map<string, number>();
    if (!category) return map;
    ledger.budgets.forEach((entry) => {
      if (entry.category?.category !== category) return;
      const key = monthKey(entry.year, entry.month);
      map.set(key, (map.get(key) ?? 0) + entry.budget);
    });
    return map;
  }, [ledger.budgets, category]);

  // Spend per month, with the month's budget as the reference marker. The
  // chart owns the scale (and so covers a marker that exceeds every bar).
  const chartPoints = useMemo<MonthPoint[]>(
    () =>
      months.map((ref, index) => {
        const key = monthKey(ref.year, ref.month);
        const budget = budgetByMonth.get(key);
        const value = points[index] ?? 0;
        return {
          key,
          label: SHORT_MONTHS[ref.month - 1],
          yearLabel: ref.month === 1 || index === 0 ? String(ref.year) : undefined,
          values: [value],
          marker: budget,
          tooltip: {
            title: `${SHORT_MONTHS[ref.month - 1]} ${ref.year}`,
            rows:
              budget === undefined
                ? [{ value: formatCurrency(value) }]
                : [
                    { label: "Brukt", value: formatCurrency(value) },
                    { label: "Budsjett", value: formatCurrency(budget), tone: "muted" as const },
                    {
                      label: value > budget ? "Over" : "Igjen",
                      value: formatCurrency(Math.abs(budget - value)),
                      tone: value > budget ? ("bad" as const) : ("good" as const),
                    },
                  ],
          },
        };
      }),
    [months, points, budgetByMonth]
  );

  const budgetedMonths = useMemo(() => {
    return months
      .map((ref, index) => {
        const key = monthKey(ref.year, ref.month);
        const budget = budgetByMonth.get(key);
        if (budget === undefined) return null;
        const actual = points[index] ?? 0;
        return {
          key,
          label: `${SHORT_MONTHS[ref.month - 1]} ${ref.year}`,
          budget,
          actual,
          diff: actual - budget,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [months, budgetByMonth, points]);

  const categoryTransactions = useMemo(() => {
    if (!category) return [];
    return selectionExpenses
      .filter((expense) => (expense.category?.category ?? "Ukategorisert") === category)
      .slice()
      .sort((a, b) => {
        const dateCompare = (b.date ?? "").localeCompare(a.date ?? "");
        return dateCompare !== 0 ? dateCompare : b.id - a.id;
      });
  }, [selectionExpenses, category]);

  return (
    <AnimatePresence>
      {category ? (
    <motion.div
      ref={panelRef}
      className={styles["panel"]}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={T_BASE}
      role="dialog"
      // Deliberately no aria-modal: this is a side panel, not a modal — the
      // CSS has no scrim, nothing traps Tab and nothing inerts the page
      // behind it. Claiming modality would remove everything outside the
      // panel from the accessibility tree while it stays keyboard-reachable,
      // so tabbing past the close button would land on controls a screen
      // reader has been told do not exist.
      aria-label={`Historikk for ${category}`}
      tabIndex={-1}
    >
      <div className={styles["header"]}>
        <div className={styles["title"]}>
          <span className="helper">Kategori</span>
          <h2>{category}</h2>
        </div>
        <button
          className="icon-btn"
          type="button"
          onClick={onClose}
          aria-label="Lukk"
        >
          <IconX />
        </button>
      </div>

      <div className={styles["body"]}>
        <div className="stat-row">
          <div className="stat stat-small">
            <span className="stat-label">Snitt pr. måned</span>
            <strong className="stat-value">
              {formatCurrency(Math.round(mean))}
            </strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Median pr. måned</span>
            <strong className="stat-value">
              {formatCurrency(Math.round(median))}
            </strong>
          </div>
        </div>

        <div>
          <h3 className={styles["section-heading"]}>{windowLabel}</h3>
          <MonthColumns
            points={chartPoints}
            series={[{ key: "spend", color: "var(--accent)" }]}
            height={130}
            ariaLabel={`${category} per måned. ${windowLabel}`}
          />
        </div>

        <div>
          <h3 className={styles["section-heading"]}>Budsjett vs. faktisk</h3>
          {budgetedMonths.length ? (
            <div className={styles["budget-table"]}>
              {budgetedMonths.map((row) => (
                <div key={row.key} className={styles["budget-row"]}>
                  <span>{row.label}</span>
                  <span className={styles["budget-figures"]}>
                    <span>{formatCurrency(row.actual)}</span>
                    <span className="helper">
                      / {formatCurrency(row.budget)}
                    </span>
                    <span className={row.diff > 0 ? styles["over"] : styles["under"]}>
                      {row.diff > 0
                        ? `${formatCurrency(row.diff)} over`
                        : `${formatCurrency(Math.abs(row.diff))} igjen`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // Income categories (and most savings categories) never get a
            // budget row, and that is a normal state, not missing data — say
            // so explicitly rather than rendering an empty table that could
            // read as "budget: 0 kr" for every month.
            <p className="helper">Ingen budsjett satt for denne kategorien.</p>
          )}
        </div>

        <div>
          <h3 className={styles["section-heading"]}>Transaksjoner i valgt periode</h3>
          {categoryTransactions.length ? (
            <div className={styles["transactions"]}>
              {categoryTransactions.map((expense) => (
                <div key={expense.id} className={styles["transaction-row"]}>
                  <span className="helper">{formatDate(expense.date)}</span>
                  <span className={styles["transaction-item"]} title={expense.item}>
                    {expense.item}
                  </span>
                  <span className={styles["transaction-amount"]}>
                    {formatCurrency(expense.price)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Ingen transaksjoner i valgt periode.</div>
          )}
        </div>
      </div>
    </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
