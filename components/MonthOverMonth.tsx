"use client";

import { useMemo } from "react";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import {
  compareMonths,
  previousMonth,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import styles from "./MonthOverMonth.module.css";

const FULL_MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

type MonthOverMonthProps = {
  entries: LedgerEntry[];
  single: MonthRef | null;
};

function formatSignedPct(pct: number) {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

type CompareStatProps = {
  label: string;
  value: number;
  delta: number;
  pct: number | null;
  increaseIsGood: boolean;
  prevLabel: string;
};

function CompareStat({
  label,
  value,
  delta,
  pct,
  increaseIsGood,
  prevLabel,
}: CompareStatProps) {
  const tone =
    delta === 0
      ? "neutral"
      : (delta > 0) === increaseIsGood
        ? "good"
        : "bad";
  const deltaLabel =
    pct !== null ? formatSignedPct(pct) : formatSignedCurrency(delta);

  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{formatCurrency(value)}</strong>
      <span className={`stat-delta ${tone}`}>
        {deltaLabel} fra {prevLabel}
      </span>
    </div>
  );
}

export default function MonthOverMonth({
  entries,
  single,
}: MonthOverMonthProps) {
  const comparison = useMemo(
    () => (single ? compareMonths(entries, single) : null),
    [entries, single]
  );
  const prevLabel = single ? FULL_MONTHS[previousMonth(single).month - 1] : "";

  return (
    <section className="card section-gap mom-card">
      <div className="card-head">
        <h2 className="section-title">Sammenlignet med forrige måned</h2>
        {single && prevLabel ? (
          <span className="helper">mot {prevLabel}</span>
        ) : null}
      </div>
      {!single ? (
        <p className={`helper ${styles["mom-hint"]}`}>
          Flere måneder valgt. Velg én måned for å sammenligne med forrige
          måned.
        </p>
      ) : comparison && comparison.previous.count > 0 ? (
        <div className={styles["mom-compare"]}>
          <div className="stat-row">
            <CompareStat
              label="Utgifter"
              value={comparison.current.expenses}
              delta={comparison.current.expenses - comparison.previous.expenses}
              pct={comparison.expensePct}
              increaseIsGood={false}
              prevLabel={prevLabel}
            />
            <CompareStat
              label="Inntekter"
              value={comparison.current.income}
              delta={comparison.current.income - comparison.previous.income}
              pct={comparison.incomePct}
              increaseIsGood
              prevLabel={prevLabel}
            />
            <CompareStat
              label="Netto"
              value={comparison.current.net}
              delta={comparison.current.net - comparison.previous.net}
              pct={null}
              increaseIsGood
              prevLabel={prevLabel}
            />
          </div>
          {comparison.movers.length ? (
            <div className={styles["movers"]}>
              <span className={styles["movers-title"]}>
                Største endringer fra {prevLabel}
              </span>
              {comparison.movers.map((mover) => {
                const isUp = mover.delta > 0;
                return (
                  <div key={mover.category} className={styles["mover-row"]}>
                    <span
                      className={`${styles["mover-arrow"]} ${isUp ? styles["mover-up"] : styles["mover-down"]}`}
                      aria-hidden="true"
                    >
                      {isUp ? "↑" : "↓"}
                    </span>
                    <span className={styles["mover-name"]}>{mover.category}</span>
                    <span className={styles["mover-flow"]}>
                      {formatCurrency(mover.previous)} →{" "}
                      {formatCurrency(mover.current)}
                    </span>
                    <span
                      className={`${styles["mover-delta"]} ${isUp ? "text-expense" : "text-income"}`}
                    >
                      {formatSignedCurrency(mover.delta)}
                      {mover.pct !== null
                        ? ` (${formatSignedPct(mover.pct)})`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={`helper ${styles["mom-hint"]}`}>
          Ingen data for forrige måned å sammenligne med.
        </p>
      )}
    </section>
  );
}
