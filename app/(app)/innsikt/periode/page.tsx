"use client";

import { useMemo } from "react";
import { useLedgerSelection, toLedgerEntries } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { periodLabel } from "@/lib/period";
import MoneyCalendar from "@/components/MoneyCalendar";
import Waterfall from "@/components/Waterfall";
import BubbleChart from "@/components/BubbleChart";
import { formatCurrency } from "@/lib/format";
import { isSpendingKind } from "@/lib/categories";
import { categorySlots } from "@/lib/categoryColor";
import { aggregateByMonth, sumMonths, type MonthRef } from "@/lib/insights";
import styles from "./periode.module.css";

/**
 * Innsikt › Periode: the selected period — a month, a year, `Alle` — read
 * several ways. Its siblings are Trender (the trailing twelve months) and
 * Reiser (each merkelapp over its own dates).
 */
export default function PeriodePage() {
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, selectedList } = usePeriod(fallback);
  const label = periodLabel(selectedList);

  const selection = useLedgerSelection(selectedKeys);
  const entries = useMemo(() => toLedgerEntries(selection), [selection]);
  const totals = useMemo(
    () => sumMonths(aggregateByMonth(entries, selectedList)),
    [entries, selectedList]
  );
  const multiYear = new Set(selectedList.map((ref) => ref.year)).size > 1;
  // One slot per category for all three charts, and the set-aware version:
  // the waterfall and the bubbles draw every category side by side, where two
  // names hashing to the same slot would be two touching marks in one colour.
  const slots = useMemo(
    () =>
      categorySlots(
        entries.filter((entry) => isSpendingKind(entry.kind)).map((entry) => entry.category)
      ),
    [entries]
  );

  return (
    <>
      <div className={`section-gap ${styles["tiles"]}`}>
        <div className={`card ${styles["tile"]}`}>
          <span className="stat-label">Inn i {label}</span>
          <strong className={styles["tile-value"]}>{formatCurrency(totals.income)}</strong>
        </div>
        <div className={`card ${styles["tile"]}`}>
          <span className="stat-label">Ut i {label}</span>
          <strong className={styles["tile-value"]}>{formatCurrency(totals.expenses)}</strong>
        </div>
        <div className={`card ${styles["tile"]}`}>
          <span className="stat-label">Igjen</span>
          <strong
            className={`${styles["tile-value"]} ${totals.net >= 0 ? "text-income" : "text-expense"}`}
          >
            {formatCurrency(totals.net)}
          </strong>
        </div>
        <div className={`card ${styles["tile"]}`}>
          <span className="stat-label">Spart</span>
          <strong className={styles["tile-value"]}>
            {totals.income > 0 ? `${Math.round((totals.net / totals.income) * 100)} %` : "—"}
          </strong>
        </div>
      </div>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Dag for dag</h2>
          <span className="helper">{label}</span>
        </div>
        {selectedList.length ? (
          <MoneyCalendar entries={entries} months={selectedList} slots={slots} />
        ) : (
          <div className="empty">Ingen periode valgt.</div>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Fra inntekt til rest</h2>
          <span className="helper">{label}</span>
        </div>
        <Waterfall entries={entries} slots={slots} />
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Alle kjøp</h2>
          <span className="helper">{label}</span>
        </div>
        <BubbleChart entries={entries} multiYear={multiYear} slots={slots} />
      </section>
    </>
  );
}
