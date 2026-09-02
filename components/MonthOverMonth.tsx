"use client";

import { useMemo } from "react";
import { MONTH_NAMES, formatCurrency, formatSignedCurrency } from "@/lib/format";
import {
  compareMonths,
  previousPeriod,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import { periodLabel } from "@/lib/period";
import styles from "./MonthOverMonth.module.css";

type MonthOverMonthProps = {
  entries: LedgerEntry[];
  /** The whole selection, not just a single month: a year compares with the
   *  year before it. */
  selected: MonthRef[];
};

/**
 * What the selection is being compared against, in three registers: the card
 * title, the "mot ..." helper, and the short form repeated on every delta chip
 * ("+12 % fra juli"), which has to stay short enough to read inline.
 */
function comparisonWording(selected: MonthRef[]) {
  const previous = previousPeriod(selected);
  if (!previous.length) return null;
  const label = periodLabel(previous);
  if (selected.length === 1) {
    return {
      title: "Sammenlignet med forrige måned",
      label,
      short: MONTH_NAMES[previous[0].month - 1],
    };
  }
  // Twelve months inside one calendar year is the year buttons' selection, and
  // its previous period is the same twelve months a year earlier.
  const isWholeYear =
    selected.length === 12 &&
    new Set(previous.map((ref) => ref.year)).size === 1;
  return {
    title: isWholeYear ? "Sammenlignet med i fjor" : "Sammenlignet med forrige periode",
    label,
    short: isWholeYear ? String(previous[0].year) : `forrige ${selected.length} mnd`,
  };
}

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
  selected,
}: MonthOverMonthProps) {
  const comparison = useMemo(
    () => compareMonths(entries, selected),
    [entries, selected]
  );
  const wording = comparisonWording(selected);
  const prevLabel = wording?.short ?? "";

  return (
    <section className="card section-gap mom-card">
      <div className="card-head">
        <h2 className="section-title">
          {wording?.title ?? "Sammenlignet med forrige periode"}
        </h2>
        {wording ? <span className="helper">mot {wording.label}</span> : null}
      </div>
      {comparison && comparison.previous.count > 0 ? (
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
          {`Ingen data for ${wording?.label ?? "forrige periode"} å sammenligne med.`}
        </p>
      )}
    </section>
  );
}
