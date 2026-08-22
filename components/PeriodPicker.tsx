"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useLedger, useLedgerHistory } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { MONTH_NAMES, formatCurrency, formatSignedCurrency } from "@/lib/format";
import {
  addMonths,
  aggregateByMonth,
  listWindowMonths,
  monthKey,
  type MonthRef,
} from "@/lib/insights";
import styles from "./PeriodPicker.module.css";

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

export default function PeriodPicker() {
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const {
    selectedKeys,
    selectedList,
    anchor,
    selectMonth,
    selectYear,
    shiftAnchor,
    resetAnchor,
    bootstrap,
  } = usePeriod(fallback);

  const { availableMonths, ensureMonthCovered } = useLedger();
  const entries = useLedgerHistory(anchor);
  const [multiSelect, setMultiSelect] = useState(false);

  const availableYears = useMemo(
    () =>
      Array.from(new Set(availableMonths.map((key) => key.slice(0, 4)))).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [availableMonths]
  );

  const yearButtons = useMemo(() => {
    const set = new Set(availableYears.map(Number));
    set.add(fallback.year);
    // Offer next year too so budgets can be planned ahead.
    set.add(fallback.year + 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [availableYears, fallback.year]);

  // Once we know which months actually have data, default the selection to the
  // current month when it has data, otherwise the most recent month that does.
  // `bootstrap` no-ops once the URL already carries a period, so this can never
  // fight a linked period.
  useEffect(() => {
    if (!availableMonths.length) return;
    const todayKey = monthKey(fallback.year, fallback.month);
    if (availableMonths.includes(todayKey)) {
      bootstrap(fallback);
      return;
    }
    const latestKey = availableMonths[availableMonths.length - 1];
    const [year, month] = latestKey.split("-");
    bootstrap({ year: Number(year), month: Number(month) });
  }, [availableMonths, fallback, bootstrap]);

  // Widen the provider's fetch window to cover anything this picker can display:
  // every selected month, and the oldest month the chart is drawing. The anchor
  // moves independently of the selection (the ‹ › arrows and the year buttons),
  // so covering only the selection would let the chart scroll into months the
  // provider never fetched — which render as empty bars, indistinguishable from
  // months that genuinely had no transactions.
  useEffect(() => {
    selectedList.forEach((ref) => ensureMonthCovered(ref));
    ensureMonthCovered(addMonths(anchor, -11));
    ensureMonthCovered(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, anchor.year, anchor.month]);

  const months = useMemo(
    () => listWindowMonths(anchor, 12),
    [anchor.year, anchor.month]
  );
  const monthly = useMemo(
    () => aggregateByMonth(entries, months),
    [entries, months]
  );
  const maxValue = useMemo(
    () =>
      Math.max(1, ...monthly.map((m) => Math.max(m.income, m.expenses))),
    [monthly]
  );

  const windowRangeLabel = useMemo(() => {
    const first = months[0];
    const last = months[months.length - 1];
    return `${SHORT_MONTHS[first.month - 1]} ${first.year} – ${SHORT_MONTHS[last.month - 1]} ${last.year}`;
  }, [months]);

  // A year button is "active" when the current selection is exactly that
  // year's twelve months.
  function isWholeYearSelected(year: number) {
    if (selectedKeys.size !== 12) return false;
    for (let m = 1; m <= 12; m += 1) {
      if (!selectedKeys.has(monthKey(year, m))) return false;
    }
    return true;
  }

  function handleColClick(event: MouseEvent, ref: MonthRef) {
    const additive = multiSelect || event.ctrlKey || event.metaKey || event.shiftKey;
    selectMonth(ref, additive);
  }

  return (
    <section className="card section-gap mom-card">
      <div className={styles["mom-head"]}>
        <div>
          <h2 className="section-title">Velg periode</h2>
          <span className="helper">{windowRangeLabel}</span>
        </div>
        <div className={styles["mom-controls"]}>
          <button
            className={`btn btn-ghost btn-small ${multiSelect ? "is-on" : ""}`}
            type="button"
            onClick={() => setMultiSelect((value) => !value)}
            aria-pressed={multiSelect}
            title="Velg flere måneder"
          >
            Velg flere
          </button>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={resetAnchor}
            title="Vis de siste 12 månedene"
          >
            I dag
          </button>
          <div className={styles["mom-nav"]}>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => shiftAnchor(-1)}
              aria-label="Vis tidligere måneder"
              title="Tidligere"
            >
              ‹
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => shiftAnchor(1)}
              aria-label="Vis senere måneder"
              title="Senere"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {yearButtons.length ? (
        <div className={styles["mom-years"]}>
          {yearButtons.map((year) => (
            <button
              key={year}
              type="button"
              className={`btn btn-ghost btn-small ${styles["mom-year"]} ${
                isWholeYearSelected(year) ? "is-on" : ""
              }`}
              onClick={() => selectYear(year)}
              title={`Velg hele ${year}`}
            >
              {year}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles["mom-chart"]} role="list">
        {monthly.map((month) => {
          const isActive = selectedKeys.has(month.key);
          const hasData = month.count > 0;
          return (
            <button
              key={month.key}
              type="button"
              role="listitem"
              aria-pressed={isActive}
              className={`${styles["mom-col"]} ${isActive ? styles["active"] : ""} ${hasData ? "" : styles["empty"]}`}
              onClick={(event) =>
                handleColClick(event, { year: month.year, month: month.month })
              }
              title={
                hasData
                  ? `${MONTH_NAMES[month.month - 1]} ${month.year}: inntekter ${formatCurrency(month.income)}, utgifter ${formatCurrency(month.expenses)}, netto ${formatSignedCurrency(month.net)}`
                  : `${MONTH_NAMES[month.month - 1]} ${month.year}: ingen data`
              }
            >
              <span className={styles["mom-bars"]} aria-hidden="true">
                <span
                  className={`${styles["mom-bar"]} ${styles["mom-bar-income"]}`}
                  style={{ height: `${(month.income / maxValue) * 100}%` }}
                />
                <span
                  className={`${styles["mom-bar"]} ${styles["mom-bar-expense"]}`}
                  style={{ height: `${(month.expenses / maxValue) * 100}%` }}
                />
              </span>
              <span className={styles["mom-label"]}>
                {SHORT_MONTHS[month.month - 1]}
                {month.month === 1 || month.key === monthly[0].key ? (
                  <span className={styles["mom-label-year"]}>{month.year}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles["mom-legend"]}>
        <span className={styles["mom-legend-item"]}>
          <span className="breakdown-dot" style={{ background: "var(--income)" }} />
          Inntekter
        </span>
        <span className={styles["mom-legend-item"]}>
          <span className="breakdown-dot" style={{ background: "var(--expense)" }} />
          Utgifter
        </span>
        <span className={`${styles["mom-legend-item"]} helper`}>
          {multiSelect
            ? "Klikk for å legge til eller fjerne måneder"
            : "Klikk på en måned · hold Ctrl/⌘ for å velge flere"}
        </span>
      </div>
    </section>
  );
}
