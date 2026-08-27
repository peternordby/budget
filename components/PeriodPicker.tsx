"use client";

import { useEffect, useMemo, type MouseEvent } from "react";
import MonthColumns, { type MonthPoint } from "@/components/MonthColumns";
import { useLedger, useLedgerHistory } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { MONTH_NAMES, formatCurrency, formatSignedCurrency } from "@/lib/format";
import {
  addMonths,
  aggregateByMonth,
  monthKey,
  type MonthRef,
} from "@/lib/insights";
import { WINDOW_AFTER, chartWindow } from "@/lib/period";
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
    shiftPeriod,
    goToToday,
    bootstrap,
  } = usePeriod(fallback);

  const { availableMonths, ensureMonthCovered } = useLedger();
  // The window overhangs the anchor by WINDOW_AFTER months, and
  // useLedgerHistory returns the twelve months *ending* at what it is given —
  // so it has to be asked for the window's last month, not the anchor. Asking
  // for the anchor left the three future columns permanently empty, even for a
  // month that had a future-dated transaction in it.
  const entries = useLedgerHistory(addMonths(anchor, WINDOW_AFTER));

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
    ensureMonthCovered(months[0]);
    ensureMonthCovered(months[months.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, anchor.year, anchor.month]);

  const months = useMemo(
    () => chartWindow(anchor),
    [anchor.year, anchor.month]
  );
  const monthly = useMemo(
    () => aggregateByMonth(entries, months),
    [entries, months]
  );
  // One point per month for the chart. The figures live in the tooltip rows
  // rather than in a `title` attribute, so they are readable at a glance and
  // reachable by a screen reader (MonthColumns builds each column button's
  // accessible name from the same rows).
  const chartPoints = useMemo<MonthPoint[]>(
    () =>
      monthly.map((month, index) => ({
        key: month.key,
        label: SHORT_MONTHS[month.month - 1],
        yearLabel:
          month.month === 1 || index === 0 ? String(month.year) : undefined,
        values: [month.income, month.expenses],
        empty: month.count === 0,
        tooltip: {
          title: `${MONTH_NAMES[month.month - 1]} ${month.year}`,
          rows: month.count
            ? [
                {
                  label: "Inntekter",
                  value: formatCurrency(month.income),
                  swatch: "var(--income)",
                },
                {
                  label: "Utgifter",
                  value: formatCurrency(month.expenses),
                  swatch: "var(--expense)",
                },
                {
                  label: "Netto",
                  value: formatSignedCurrency(month.net),
                  tone: month.net >= 0 ? ("good" as const) : ("bad" as const),
                },
              ]
            : [{ value: "Ingen data", tone: "muted" as const }],
        },
      })),
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

  function handleColClick(point: MonthPoint, event: MouseEvent) {
    const month = monthly.find((candidate) => candidate.key === point.key);
    if (!month) return;
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    selectMonth({ year: month.year, month: month.month }, additive);
  }

  return (
    <section className="card section-gap mom-card">
      <div className={styles["mom-head"]}>
        <div>
          <h2 className="section-title">Velg periode</h2>
          <span className="helper">{windowRangeLabel}</span>
        </div>
        <div className={styles["mom-controls"]}>
          {/* "Velg flere" was a mode toggle for something the modifier keys
              already did, and the two ways of expressing "add a month" could
              disagree — the toggle stayed on while nothing looked different. */}
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={goToToday}
            title="Velg denne måneden og vis de siste 12 månedene"
          >
            I dag
          </button>
          <div className={styles["mom-nav"]}>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => shiftPeriod(-1)}
              aria-label="Forrige måned"
              title="Forrige måned"
            >
              ‹
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => shiftPeriod(1)}
              aria-label="Neste måned"
              title="Neste måned"
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

      <MonthColumns
        points={chartPoints}
        series={[
          { key: "income", color: "var(--income)" },
          { key: "expense", color: "var(--expense)" },
        ]}
        height={150}
        // The figures are in the tooltip and this chart's job is picking a
        // month, not reading a kroner value off the axis.
        axisValues={false}
        selectedKeys={selectedKeys}
        onSelect={handleColClick}
        selectHint={(point) => `Velg ${point.tooltip.title}`}
        ariaLabel={`Inntekter og utgifter per måned, ${windowRangeLabel}`}
      />

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
          Klikk på en måned · hold Ctrl/⌘ for å velge flere
        </span>
      </div>
    </section>
  );
}
