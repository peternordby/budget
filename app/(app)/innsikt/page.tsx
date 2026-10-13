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
import styles from "./innsikt.module.css";

/**
 * The selected period — a month, a year, `Alle` — read several ways. The
 * trailing-twelve-month view of the same ledger is /trender.
 */
export default function InnsiktPage() {
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, selectedList, single } = usePeriod(fallback);
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
          <h2 className="section-title">Pengekalenderen</h2>
          <span className="helper">{label}</span>
        </div>
        <p className={`helper ${styles["lede"]}`}>
          {single
            ? "Jo rødere dag, jo mer gikk ut. Prikken har fargen til dagens største utgift; en grønn prikk betyr penger inn."
            : "Én rute per dag, én kolonne per uke. Jo rødere, jo mer gikk ut — se etter dyre helger og stille mandager."}
        </p>
        {selectedList.length ? (
          <MoneyCalendar entries={entries} months={selectedList} slots={slots} />
        ) : (
          <div className="empty">Ingen periode valgt.</div>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Lønna smelter</h2>
          <span className="helper">{label}</span>
        </div>
        <p className={`helper ${styles["lede"]}`}>
          Fra alt som kom inn, kategori for kategori, ned til det som ble igjen.
          Sparing regnes som igjen.
        </p>
        <Waterfall entries={entries} slots={slots} />
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Bobleregnet</h2>
          <span className="helper">{label}</span>
        </div>
        <p className={`helper ${styles["lede"]}`}>
          Hver boble er ett kjøp, størrelsen er beløpet, gruppert per kategori.
        </p>
        <BubbleChart entries={entries} multiYear={multiYear} slots={slots} />
      </section>
    </>
  );
}
