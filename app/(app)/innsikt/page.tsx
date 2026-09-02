"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAnalysisWindow,
  useLedger,
  useLedgerHistory,
  toLedgerEntries,
} from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import {
  monthRangeLabel,
  periodLabel,
  windowLabel as formatWindowLabel,
} from "@/lib/period";
import Sparkline from "@/components/Sparkline";
import MonthOverMonth from "@/components/MonthOverMonth";
import Anomalies from "@/components/Anomalies";
import CategoryDrilldown from "@/components/CategoryDrilldown";
import { supabase } from "@/lib/supabaseClient";
import {
  MONTH_NAMES,
  formatCurrency,
  formatSignedCurrency,
  formatDateParts,
} from "@/lib/format";
import {
  aggregateByMonth,
  monthKey,
  previousPeriod,
  type MonthRef,
} from "@/lib/insights";
import { lastDayOfMonth } from "@/lib/recurring";
import { categorySeries, mixSummary, spendingMix } from "@/lib/trends";
import {
  detectSubscriptions,
  normaliseItem,
  type SuspectedSubscription,
} from "@/lib/subscriptions";
import { IconX } from "@/components/icons";
import { ShareBar, type ShareSegment } from "@/components/charts";
import { categoryColor, getCategorySlot } from "@/lib/categoryColor";
import MonthColumns, { type MonthPoint } from "@/components/MonthColumns";
import { useDismissals } from "@/lib/dismissals";
import { decField, encField } from "@/lib/crypto";
import styles from "./innsikt.module.css";

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

// One year of history: a full seasonal cycle, and every section compares
// against the same twelve months the rest of the app already works in
// (useLedgerHistory, the period picker's window).
const ANALYSIS_MONTHS = 12;

// The detection window. Mirrors the phrasing on the /transaksjoner search
// scope line: the copy states the real month count and range rather than a
// hard-coded "siste seks måneder" that a clamped window could contradict.
const SUBSCRIPTION_MONTHS = 6;

// Groups by item + category, matching how detectSubscriptions groups its
// input, so two suspects never collide on the same busy/action key.
function subscriptionKey(sub: SuspectedSubscription) {
  return `${sub.item}__${sub.category}`;
}

// lastDate is always a YYYY-MM-DD string produced by the ledger, so the day
// component is always present; the fallback only guards a malformed value.
function dayOfMonthFromDate(date: string) {
  const day = Number(date.slice(8, 10));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
}

export default function InnsiktPage() {
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
  const { selectedKeys, selectedList, single, anchor } = usePeriod(fallback);
  const { isDismissed, dismiss, restoreAll } = useDismissals();

  // Trailing twelve months ending at the selected month, clamped to the fetched
  // range — deliberately *not* ledger.windowStart/windowEnd, which are a fetch
  // detail the period picker can widen in either direction. See
  // useAnalysisWindow in components/LedgerProvider.tsx.
  const months = useAnalysisWindow(anchor, ANALYSIS_MONTHS);

  // Every figure on the page is computed over `months`, so each section's
  // header states the real range rather than implying a fixed 12.
  const windowLabel = useMemo(() => formatWindowLabel(months), [months]);

  // MonthOverMonth compares the selection with the period before it, which for
  // a year button is the whole year before — months the layout's picker never
  // widens the fetch to cover, and unfetched months would read as a real drop
  // to zero. This is the page's one exception to leaving the window alone.
  const comparisonStart = useMemo(
    () => previousPeriod(selectedList)[0] ?? null,
    [selectedList]
  );
  useEffect(() => {
    if (comparisonStart) ledger.ensureMonthCovered(comparisonStart);
  }, [comparisonStart?.year, comparisonStart?.month, ledger.ensureMonthCovered]);

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

  // Anomalies takes a trailing 12-month window off the same anchor: it is the
  // window detectAnomalies treats as the complete history for its averages, and
  // Anomalies.tsx says so in its copy. MonthOverMonth deliberately does *not*
  // use it — it buckets by explicit month keys, so it takes the whole fetched
  // ledger and can reach a full period back past this window.
  const historyEntries = useLedgerHistory(anchor);
  const label = periodLabel(selectedList);

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
          label: SHORT_MONTHS[ref.month - 1],
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
  // --- Section 4: Abonnementer vi ikke har registrert ---

  // Safe now that `months` ends at the selected month rather than at the
  // fetch edge: these are the six months up to and including the anchor.
  const lastSixMonths = useMemo(() => months.slice(-SUBSCRIPTION_MONTHS), [months]);
  const subscriptionRangeLabel = useMemo(
    () => monthRangeLabel(lastSixMonths),
    [lastSixMonths]
  );
  const allSubscriptions = useMemo(
    () => detectSubscriptions(entries, ledger.templates, lastSixMonths),
    [entries, ledger.templates, lastSixMonths]
  );
  // Detection is pure and recomputed every render, so "I know about this one
  // and it is deliberate" has to be filtered in at the call site. Keyed by the
  // normalised item name, which is what detectSubscriptions groups on.
  const subscriptions = useMemo(
    () =>
      allSubscriptions.filter(
        (sub) => !isDismissed("subscription", normaliseItem(sub.item))
      ),
    [allSubscriptions, isDismissed]
  );
  const hiddenSubscriptions = allSubscriptions.length - subscriptions.length;
  const categoryByName = useMemo(() => {
    const map = new Map<string, { id: number }>();
    ledger.categories.forEach((category) => map.set(category.category, category));
    return map;
  }, [ledger.categories]);
  const [subscriptionBusyKey, setSubscriptionBusyKey] = useState<string | null>(
    null
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null
  );

  async function handleAddSubscription(sub: SuspectedSubscription) {
    const category = categoryByName.get(sub.category);
    // The button is disabled whenever this is missing; this guard only
    // covers a race between render and click, never a wrong or null
    // category_id being inserted.
    if (!category) return;

    // Keyed by the same normalisation the template lookup below uses (not
    // subscriptionKey's item+category compound), so the row this disables is
    // provably the row the write targets.
    const key = normaliseItem(sub.item);
    setSubscriptionBusyKey(key);
    setSubscriptionStatus(null);

    const fields = {
      item: await encField(sub.item),
      price: await encField(sub.typicalAmount),
      category_id: category.id,
      tag: null,
      day_of_month: dayOfMonthFromDate(sub.lastDate),
    };

    // A *paused* template deliberately leaves its item in the suspect list
    // (lib/subscriptions.ts only suppresses active ones — a paused template
    // means the spend is unmanaged, not that it stopped). Inserting here
    // would leave two templates for the same item, and un-pausing the old one
    // later would book it twice every month. Reactivate that one instead,
    // matched on the same normalisation detectSubscriptions grouped by.
    const normalised = key;
    const existing =
      ledger.templates.find(
        (template) => normaliseItem(template.item) === normalised
      ) ?? null;

    let templateId: number | null = existing?.id ?? null;

    // Cleared only on a failure that left no template row written, so the
    // user can retry. `ledger.refetch()` (components/LedgerProvider.tsx) only
    // bumps a reload token and returns immediately — it does not wait for the
    // reload to land — so `ledger.templates` is still the pre-write snapshot
    // for a while after this function returns. If the button re-enabled at
    // that point, a second click would still compute `existing` against the
    // stale cache and could insert a second *active* template for the same
    // item. Leaving the row disabled once a template has actually been
    // written is safe: once the real reload lands, detectSubscriptions stops
    // reporting this item (its template is now active) and the row disappears
    // from the table entirely, taking the disabled button with it.
    let templateWritten = false;

    try {
      if (existing) {
        const { error } = await supabase
          .from("recurring_expense")
          .update({ ...fields, active: true })
          .eq("id", existing.id)
          .eq("user_id", ledger.userId);
        if (error) {
          setSubscriptionStatus(error.message);
          return;
        }
      } else {
        const { data, error } = await supabase
          .from("recurring_expense")
          .insert({ ...fields, user_id: ledger.userId })
          .select("id")
          .single();
        if (error) {
          setSubscriptionStatus(error.message);
          return;
        }
        templateId = data?.id ?? null;
      }
      templateWritten = true;

      // Every suspect is by construction hand-entered, so its expense rows
      // have recurring_id null — and RecurringPanel decides what is already
      // booked by matching recurring_id (lib/recurring.ts, pendingTemplates).
      // Without this stamp, a month the user already paid for by hand would
      // be offered for generation and inserted a second time. Only the rows
      // the detection actually matched are touched, and they are all inside
      // the window, so this never claims a month the template did not cover.
      let linkedCount = 0;
      if (templateId !== null && sub.expenseIds.length) {
        const { error } = await supabase
          .from("expense")
          .update({ recurring_id: templateId })
          .in("id", sub.expenseIds)
          .eq("user_id", ledger.userId);
        if (error) {
          setSubscriptionStatus(error.message);
          // The template itself was written; leave it (templateWritten stays
          // true) and let the refetch show the real state rather than
          // pretending nothing happened.
          await ledger.refetch();
          return;
        }
        linkedCount = sub.expenseIds.length;
      }

      // The detection window ends at the selected period, not necessarily at
      // today (see lastSixMonths above). When it doesn't cover the current
      // calendar month, that month's hand-entered row (if any) never made it
      // into `sub.expenseIds`, and it may not even be sitting in
      // `ledger.expenses` — the provider's fetch window is keyed off whatever
      // "today" was when this tab was opened (components/LedgerProvider.tsx),
      // not off the live clock. So this cannot be answered from the cache; it
      // needs its own scoped query straight to Supabase, filtered by
      // `recurring_id is null` (never re-point a row that already belongs to
      // another template) and `user_id` (never touch another user's rows) —
      // the same two properties the window stamp above relies on.
      const now = new Date();
      const currentMonth: MonthRef = {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      };
      const currentMonthKey = monthKey(currentMonth.year, currentMonth.month);
      const coveredByWindow = lastSixMonths.some(
        (ref) => monthKey(ref.year, ref.month) === currentMonthKey
      );

      if (templateId !== null && !coveredByWindow) {
        const start = formatDateParts(currentMonth.year, currentMonth.month, 1);
        const end = formatDateParts(
          currentMonth.year,
          currentMonth.month,
          lastDayOfMonth(currentMonth.year, currentMonth.month)
        );
        const { data: currentMonthRows, error: currentMonthError } =
          await supabase
            .from("expense")
            .select("id, item")
            .eq("user_id", ledger.userId)
            .is("recurring_id", null)
            .gte("date", start)
            .lte("date", end);

        if (currentMonthError) {
          setSubscriptionStatus(currentMonthError.message);
          await ledger.refetch();
          return;
        }

        // `item` comes back encrypted, so it has to be decrypted before the
        // name comparison. Comparing the ciphertext would match nothing, this
        // month's hand-entered row would keep `recurring_id` null, and
        // RecurringPanel would offer to book it a second time.
        const decrypted = await Promise.all(
          (currentMonthRows ?? []).map(async (row: any) => ({
            id: row.id,
            item: (await decField(row.item)) ?? "",
          }))
        );
        const currentMonthIds = decrypted
          .filter((row) => normaliseItem(row.item) === normalised)
          .map((row) => row.id);

        if (currentMonthIds.length) {
          const { error } = await supabase
            .from("expense")
            .update({ recurring_id: templateId })
            .in("id", currentMonthIds)
            .eq("user_id", ledger.userId)
            .is("recurring_id", null);
          if (error) {
            setSubscriptionStatus(error.message);
            await ledger.refetch();
            return;
          }
          linkedCount += currentMonthIds.length;
        }
      }

      const linkedNote =
        linkedCount === 1
          ? " 1 tidligere føring er koblet til den."
          : linkedCount > 1
            ? ` ${linkedCount} tidligere føringer er koblet til den.`
            : "";
      setSubscriptionStatus(
        existing
          ? `Aktiverte den eksisterende faste utgiften «${sub.item}» på nytt.${linkedNote}`
          : `«${sub.item}» er nå registrert som fast utgift.${linkedNote}`
      );

      await ledger.refetch();
    } catch (err) {
      setSubscriptionStatus(
        err instanceof Error ? err.message : "Uventet feil ved registrering."
      );
    } finally {
      // A failed write that never reached Supabase (a thrown network error,
      // for instance) also leaves templateWritten false, so this still
      // re-enables the row rather than leaving it dead until a page reload.
      if (!templateWritten) setSubscriptionBusyKey(null);
    }
  }

  return (
    <>
      {/* Moved from /oversikt: both are about the selection against its recent
          past, which is an insight rather than an overview, and having them
          here puts every "what does this mean" section on one route.
          MonthOverMonth leads because it is the summary; Avvik sits last, since
          it is a list of things to go and check rather than something to read
          the month by. */}
      <MonthOverMonth entries={entries} selected={selectedList} />

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

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Abonnementer vi ikke har registrert</h2>
          {hiddenSubscriptions ? (
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => restoreAll("subscription")}
            >
              Vis {hiddenSubscriptions} skjulte
            </button>
          ) : null}
        </div>
        {subscriptionStatus ? <div className="status">{subscriptionStatus}</div> : null}
        {subscriptions.length ? (
          <div className={styles["subscription-table"]}>
            <div className={styles["subscription-head"]}>
              <span>Vare</span>
              <span>Kategori</span>
              <span className="num">Måneder sett</span>
              <span className="num">Pr. måned</span>
              <span className="num">Pr. år</span>
              <span>Handling</span>
            </div>
            {subscriptions.map((sub) => {
              const key = subscriptionKey(sub);
              const category = categoryByName.get(sub.category);
              const canRegister = Boolean(category);
              // Matches the key handleAddSubscription tracks busy state
              // under (normaliseItem(sub.item)), not the item+category
              // compound used for the row's React key below.
              const busy = subscriptionBusyKey === normaliseItem(sub.item);
              return (
                <div key={key} className={styles["subscription-row"]}>
                  <span className={styles["subscription-item"]}>{sub.item}</span>
                  <span className="helper">{sub.category}</span>
                  <span className="num">{sub.monthsSeen}</span>
                  <span className="num">{formatCurrency(sub.monthlyCost)}</span>
                  <span className="num">{formatCurrency(sub.annualCost)}</span>
                  <span className={styles["subscription-action"]}>
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      onClick={() => handleAddSubscription(sub)}
                      disabled={!canRegister || busy}
                      title={
                        canRegister
                          ? "Gjør til fast utgift"
                          : `Kategorien «${sub.category}» finnes ikke, kan ikke registreres`
                      }
                    >
                      {busy ? "Legger inn..." : "Gjør til fast utgift"}
                    </button>
                    {!canRegister ? (
                      <span className="helper">Kategori mangler</span>
                    ) : null}
                    <button
                      className="icon-btn icon-btn-sm"
                      type="button"
                      onClick={() => dismiss("subscription", normaliseItem(sub.item))}
                      aria-label={`Skjul ${sub.item}`}
                      title="Skjul: dette er ikke et abonnement vi vil registrere"
                    >
                      <IconX />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            {`Ingen ukjente abonnementer funnet i de siste ${lastSixMonths.length} månedene (${subscriptionRangeLabel}).`}
          </div>
        )}
      </section>

      {/* Last, deliberately: it is a to-do list about the month, and it used
          to push the month's actual figures below the fold. */}
      <Anomalies
        entries={historyEntries}
        selected={single}
        periodLabel={label}
        templates={ledger.templates}
      />

      <CategoryDrilldown
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
        anchor={anchor}
      />
    </>
  );
}
