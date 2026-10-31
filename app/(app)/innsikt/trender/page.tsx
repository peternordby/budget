"use client";

import { useCallback, useMemo, useState } from "react";
import {
  useAnalysisWindow,
  useLedger,
  toLedgerEntries,
} from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { windowLabel as formatWindowLabel } from "@/lib/period";
import Sparkline from "@/components/Sparkline";
import CategoryDrilldown from "@/components/CategoryDrilldown";
import {
  MONTH_NAMES,
  SHORT_MONTH_NAMES,
  formatCurrency,
  formatSignedCurrency,
} from "@/lib/format";
import { aggregateByMonth, type MonthRef } from "@/lib/insights";
import { categorySeries, mixSummary, spendingMix } from "@/lib/trends";
import { ShareBar, type ShareSegment } from "@/components/charts";
import { categoryColor, getCategorySlot } from "@/lib/categoryColor";
import MonthColumns, { type MonthPoint } from "@/components/MonthColumns";
import styles from "./trender.module.css";

// One year of history: a full seasonal cycle, and every section compares
// against the same twelve months the rest of the app already works in
// (useLedgerHistory, the period picker's window).
const ANALYSIS_MONTHS = 12;

export default function TrenderPage() {
  const ledger = useLedger();

  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  // Destructured immediately per usePeriod's contract: it returns a fresh
  // object literal every render, so only its memoized fields (selectedKeys)
  // are kept, never the returned PeriodApi itself. `anchor` is a plain value,
  // so holding it is safe. Used here to mirror the current period selection
  // onto the fixed-vs-variable chart and to anchor the analysis window — this
  // page does not add a picker or a widening effect of its own; both already
  // live in the layout.
  const { selectedKeys, anchor } = usePeriod(fallback);

  // Trailing twelve months ending at the selected month, clamped to the fetched
  // range — deliberately *not* ledger.windowStart/windowEnd, which are a fetch
  // detail the period picker can widen in either direction. See
  // useAnalysisWindow in components/LedgerProvider.tsx.
  const months = useAnalysisWindow(anchor, ANALYSIS_MONTHS);

  // Every figure on the page is computed over `months`, so each section's
  // header states the real range rather than implying a fixed 12.
  const windowLabel = useMemo(() => formatWindowLabel(months), [months]);

  // Both sparklines index straight into `months`: every series on this page is
  // bucketed over it, one point per month, so the point index is the month.
  const monthTitleAt = useCallback(
    (index: number) => {
      const ref = months[index];
      return ref ? `${MONTH_NAMES[ref.month - 1]} ${ref.year}` : "";
    },
    [months]
  );

  const entries = useMemo(
    () => toLedgerEntries(ledger.expenses),
    [ledger.expenses]
  );

  // --- Section 1: Inntekt mot utgift ---

  // The delta itself is the subject, so each month is one bar measured from a
  // zero line rather than a pair of bars whose gap has to be eyeballed —
  // PeriodPicker already draws that pair at the top of every page.
  const monthly = useMemo(
    () => aggregateByMonth(entries, months),
    [entries, months]
  );
  // One point per month. MonthColumns owns the scale: it puts zero on a
  // gridline and spans both directions with one linear scale, so a 10 000
  // surplus bar really is ten times a 1 000 deficit bar.
  const netPoints = useMemo<MonthPoint[]>(
    () =>
      monthly.map((point, index) => {
        const ref = months[index];
        return {
          key: point.key,
          label: SHORT_MONTH_NAMES[ref.month - 1],
          yearLabel: ref.month === 1 || index === 0 ? String(ref.year) : undefined,
          values: [point.net],
          empty: point.count === 0,
          tooltip: {
            title: `${MONTH_NAMES[ref.month - 1]} ${ref.year}`,
            rows: [
              { label: "Inntekter", value: formatCurrency(point.income) },
              { label: "Utgifter", value: formatCurrency(point.expenses) },
              {
                label: "Netto",
                value: formatSignedCurrency(point.net),
                tone: point.net >= 0 ? ("good" as const) : ("bad" as const),
              },
            ],
          },
        };
      }),
    [monthly, months]
  );
  const netTotals = useMemo(() => {
    const surplus = monthly.filter((point) => point.net > 0).length;
    const sum = monthly.reduce((total, point) => total + point.net, 0);
    return { surplus, deficit: monthly.length - surplus, sum };
  }, [monthly]);

  // --- Section 2: Faste og variable utgifter ---

  const mix = useMemo(() => spendingMix(entries, months), [entries, months]);
  const mixTotals = useMemo(() => mixSummary(mix), [mix]);
  // Four segments of one average month, in the order money actually leaves:
  // what is already committed, what was chosen, what was put aside, what was
  // never spent. `base` is the denominator mixSummary picked, so these always
  // total 100 %.
  const mixSegments = useMemo<(ShareSegment & { percent: number })[]>(() => {
    if (mixTotals.base <= 0) return [];
    return [
      { key: "fixed", label: "Fast", value: mixTotals.fixed, color: "var(--accent)" },
      { key: "variable", label: "Variabelt", value: mixTotals.variable, color: "var(--expense)" },
      { key: "savings", label: "Sparing", value: mixTotals.savings, color: "var(--income)" },
      { key: "leftover", label: "Ubrukt", value: mixTotals.leftover, color: "var(--muted)" },
    ]
      .filter((segment) => segment.value > 0)
      .map((segment) => ({
        ...segment,
        percent: (segment.value / mixTotals.base) * 100,
      }));
  }, [mixTotals]);
  const fixedPoints = useMemo(() => mix.map((point) => point.fixed), [mix]);

  // --- Section 3: Kategorier over tid ---

  const series = useMemo(() => categorySeries(entries, months), [entries, months]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeMix, setActiveMix] = useState<string | null>(null);
  return (
    <>
      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Inntekt mot utgift</h2>
          <span className="helper">{windowLabel}</span>
        </div>
        {ledger.loading ? (
          <p className="helper">Laster transaksjoner...</p>
        ) : ledger.error ? (
          <p className="helper">
            Transaksjoner kunne ikke lastes, så tallene kan være feil.
          </p>
        ) : (
          <>
            <MonthColumns
              points={netPoints}
              series={[
                {
                  key: "net",
                  color: "var(--income)",
                  negativeColor: "var(--expense)",
                },
              ]}
              height={170}
              diverging
              selectedKeys={selectedKeys}
              ariaLabel={`Netto per måned, ${windowLabel}`}
            />
            <div className="stat-row">
              <div className="stat stat-small">
                <span className="stat-label">Sum netto</span>
                <strong
                  className={`stat-value ${netTotals.sum >= 0 ? "is-good" : "is-bad"}`}
                >
                  {formatSignedCurrency(netTotals.sum)}
                </strong>
              </div>
              <div className="stat stat-small">
                <span className="stat-label">Måneder i pluss</span>
                <strong className="stat-value">{netTotals.surplus}</strong>
              </div>
              <div className="stat stat-small">
                <span className="stat-label">Måneder i minus</span>
                <strong className="stat-value">{netTotals.deficit}</strong>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Faste og variable utgifter</h2>
          <span className="helper">Snitt pr. måned · {windowLabel}</span>
        </div>
        {mixSegments.length ? (
          <>
            <ShareBar
              segments={mixSegments}
              formatValue={(value) => formatCurrency(Math.round(value))}
              activeKey={activeMix}
              onActiveKey={setActiveMix}
              ariaLabel="Snittmåneden fordelt på fast, variabelt, sparing og ubrukt"
            />
            <div className={styles["mix-legend"]}>
              {mixSegments.map((segment) => (
                <span
                  key={segment.key}
                  className={styles["mix-legend-item"]}
                  data-dim={activeMix && activeMix !== segment.key ? "true" : undefined}
                  onMouseEnter={() => setActiveMix(segment.key)}
                  onMouseLeave={() => setActiveMix(null)}
                >
                  <span className="breakdown-dot" style={{ background: segment.color }} />
                  <span className={styles["mix-legend-name"]}>{segment.label}</span>
                  <span className="num">{formatCurrency(Math.round(segment.value))}</span>
                  <span className="helper">{Math.round(segment.percent)} %</span>
                </span>
              ))}
            </div>

            <div className="stat-row">
              <div className="stat">
                <span className="stat-label">Bundet hver måned</span>
                <strong className="stat-value">
                  {formatCurrency(Math.round(mixTotals.fixed))}
                </strong>
                <span className="helper">
                  {mixTotals.fixedShareOfIncome !== null
                    ? `${Math.round(mixTotals.fixedShareOfIncome * 100)} % av inntekten`
                    : "Ingen inntekt registrert"}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Igjen etter faste</span>
                <strong className="stat-value">
                  {mixTotals.headroom !== null
                    ? formatCurrency(Math.round(mixTotals.headroom))
                    : "—"}
                </strong>
                <span className="helper">Til variabelt og sparing</span>
              </div>
              <div className="stat">
                <span className="stat-label">Endring i faste</span>
                {mixTotals.trend ? (
                  <>
                    <strong
                      className={`stat-value ${
                        mixTotals.trend.delta > 0
                          ? "is-bad"
                          : mixTotals.trend.delta < 0
                            ? "is-good"
                            : ""
                      }`}
                    >
                      {formatSignedCurrency(Math.round(mixTotals.trend.delta))}
                    </strong>
                    <span className="helper">
                      {`Siste ${mixTotals.trend.months} mnd mot forrige ${mixTotals.trend.months}`}
                    </span>
                  </>
                ) : (
                  <>
                    <strong className="stat-value">—</strong>
                    <span className="helper">Trenger minst 4 måneder</span>
                  </>
                )}
              </div>
            </div>

            {/* The stat above says whether the committed cost moved; this says
                how it moved. A fixed cost creeping up a step at a time is the
                thing a monthly column chart made you eyeball and miss. */}
            <div className={styles["mix-trend"]}>
              <span className="stat-label">Faste utgifter pr. måned</span>
              <Sparkline
                points={fixedPoints}
                ariaLabel="Faste utgifter per måned"
                hover={{
                  title: monthTitleAt,
                  value: (index) =>
                    formatCurrency(Math.round(fixedPoints[index] ?? 0)),
                }}
              />
            </div>
          </>
        ) : (
          <div className="empty">
            Ingen inntekt eller utgifter registrert i perioden.
          </div>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Kategorier over tid</h2>
          <span className="helper">{windowLabel}</span>
        </div>
        {series.length ? (
          <div className={styles["category-grid"]}>
            {series.map((entry) => {
              const isSelected = selectedCategory === entry.category;
              return (
                <button
                  key={entry.category}
                  type="button"
                  className={`${styles["category-tile"]} ${isSelected ? styles["active"] : ""}`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedCategory((current) =>
                      current === entry.category ? null : entry.category
                    )
                  }
                >
                  <span className={styles["category-tile-name"]}>{entry.category}</span>
                  <span className={styles["tile-chart"]}>
                    <Sparkline
                      points={entry.points}
                      color={categoryColor(getCategorySlot(entry.category))}
                      ariaLabel={`Utvikling for ${entry.category}`}
                      hover={{
                        title: monthTitleAt,
                        value: (index) =>
                          formatCurrency(entry.points[index] ?? 0),
                      }}
                    />
                  </span>
                  <span className={styles["category-tile-stats"]}>
                    <span className={styles["tile-stat"]}>
                      <span className="stat-label">Totalt</span>
                      <span className="num">{formatCurrency(entry.total)}</span>
                    </span>
                    <span className={styles["tile-stat"]}>
                      <span className="stat-label">Snitt</span>
                      <span className="num">
                        {formatCurrency(Math.round(entry.mean))}
                      </span>
                    </span>
                    <span className={styles["tile-stat"]}>
                      <span className="stat-label">Median</span>
                      <span className="num">
                        {formatCurrency(Math.round(entry.median))}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty">Ingen kategoridata i perioden.</div>
        )}
      </section>

      <CategoryDrilldown
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
        anchor={anchor}
      />
    </>
  );
}
