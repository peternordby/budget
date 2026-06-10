"use client";

import { useMemo, type MouseEvent } from "react";
import { formatCurrency } from "@/lib/format";
import {
  aggregateByMonth,
  compareMonths,
  listWindowMonths,
  monthKey,
  previousMonth,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";

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
  anchor: MonthRef;
  selectedKeys: Set<string>;
  single: MonthRef | null;
  years: number[];
  multiSelect: boolean;
  onSelectMonth: (ref: MonthRef, additive: boolean) => void;
  onSelectYear: (year: number) => void;
  onShiftWindow: (delta: number) => void;
  onResetWindow: () => void;
  onToggleMultiSelect: () => void;
};

function formatSignedPct(pct: number) {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
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
    <div className="compare-stat">
      <span className="compare-stat-label">{label}</span>
      <strong className="compare-stat-value">{formatCurrency(value)}</strong>
      <span className={`compare-chip ${tone}`}>
        {deltaLabel} fra {prevLabel}
      </span>
    </div>
  );
}

export default function MonthOverMonth({
  entries,
  anchor,
  selectedKeys,
  single,
  years,
  multiSelect,
  onSelectMonth,
  onSelectYear,
  onShiftWindow,
  onResetWindow,
  onToggleMultiSelect,
}: MonthOverMonthProps) {
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
  const comparison = useMemo(
    () => (single ? compareMonths(entries, single) : null),
    [entries, single]
  );
  const prevLabel = single ? FULL_MONTHS[previousMonth(single).month - 1] : "";

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
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    onSelectMonth(ref, additive);
  }

  return (
    <section className="card section-gap mom-card">
      <div className="mom-head">
        <div>
          <h2 className="section-title">Velg periode</h2>
          <span className="helper">{windowRangeLabel}</span>
        </div>
        <div className="mom-controls">
          <button
            className={`btn btn-ghost btn-small ${multiSelect ? "is-on" : ""}`}
            type="button"
            onClick={onToggleMultiSelect}
            aria-pressed={multiSelect}
            title="Velg flere måneder"
          >
            Velg flere
          </button>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={onResetWindow}
            title="Vis de siste 12 månedene"
          >
            I dag
          </button>
          <div className="mom-nav">
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => onShiftWindow(-1)}
              aria-label="Vis tidligere måneder"
              title="Tidligere"
            >
              ‹
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => onShiftWindow(1)}
              aria-label="Vis senere måneder"
              title="Senere"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {years.length ? (
        <div className="mom-years">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              className={`mom-year ${isWholeYearSelected(year) ? "active" : ""}`}
              onClick={() => onSelectYear(year)}
              title={`Velg hele ${year}`}
            >
              {year}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mom-chart" role="list">
        {monthly.map((month) => {
          const isActive = selectedKeys.has(month.key);
          const hasData = month.count > 0;
          return (
            <button
              key={month.key}
              type="button"
              role="listitem"
              aria-pressed={isActive}
              className={`mom-col ${isActive ? "active" : ""} ${hasData ? "" : "empty"}`}
              onClick={(event) =>
                handleColClick(event, { year: month.year, month: month.month })
              }
              title={
                hasData
                  ? `${FULL_MONTHS[month.month - 1]} ${month.year}: inntekter ${formatCurrency(month.income)}, utgifter ${formatCurrency(month.expenses)}, netto ${formatSignedCurrency(month.net)}`
                  : `${FULL_MONTHS[month.month - 1]} ${month.year}: ingen data`
              }
            >
              <span className="mom-bars" aria-hidden="true">
                <span
                  className="mom-bar mom-bar-income"
                  style={{ height: `${(month.income / maxValue) * 100}%` }}
                />
                <span
                  className="mom-bar mom-bar-expense"
                  style={{ height: `${(month.expenses / maxValue) * 100}%` }}
                />
              </span>
              <span className="mom-label">
                {SHORT_MONTHS[month.month - 1]}
                {month.month === 1 || month.key === monthly[0].key ? (
                  <span className="mom-label-year">{month.year}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mom-legend">
        <span className="mom-legend-item">
          <span className="breakdown-dot" style={{ background: "var(--income)" }} />
          Inntekter
        </span>
        <span className="mom-legend-item">
          <span className="breakdown-dot" style={{ background: "var(--expense)" }} />
          Utgifter
        </span>
        <span className="mom-legend-item helper">
          {multiSelect
            ? "Klikk for å legge til eller fjerne måneder"
            : "Klikk på en måned · hold Ctrl/⌘ for å velge flere"}
        </span>
      </div>

      {!single ? (
        selectedKeys.size > 1 ? (
          <p className="helper mom-hint">
            Flere måneder valgt. Velg én måned for å sammenligne med forrige
            måned.
          </p>
        ) : (
          <p className="helper mom-hint">
            Velg en måned for å sammenligne med forrige måned.
          </p>
        )
      ) : comparison && comparison.previous.count > 0 ? (
        <div className="mom-compare">
          <div className="mom-compare-grid">
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
            <div className="movers">
              <span className="movers-title">
                Største endringer fra {prevLabel}
              </span>
              {comparison.movers.map((mover) => {
                const isUp = mover.delta > 0;
                return (
                  <div key={mover.category} className="mover-row">
                    <span
                      className={`mover-arrow ${isUp ? "mover-up" : "mover-down"}`}
                      aria-hidden="true"
                    >
                      {isUp ? "↑" : "↓"}
                    </span>
                    <span className="mover-name">{mover.category}</span>
                    <span className="mover-flow">
                      {formatCurrency(mover.previous)} →{" "}
                      {formatCurrency(mover.current)}
                    </span>
                    <span
                      className={`mover-delta ${isUp ? "text-expense" : "text-income"}`}
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
        <p className="helper mom-hint">
          Ingen data for forrige måned å sammenligne med.
        </p>
      )}
    </section>
  );
}
