"use client";

import { useMemo, useState } from "react";
import {
  useAnalysisWindow,
  useLedger,
  toLedgerEntries,
} from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import Sparkline from "@/components/Sparkline";
import CategoryDrilldown from "@/components/CategoryDrilldown";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, formatDateParts } from "@/lib/format";
import { monthKey, type MonthRef } from "@/lib/insights";
import { lastDayOfMonth } from "@/lib/recurring";
import {
  categorySeries,
  fixedVariableSplit,
  savingsRate,
} from "@/lib/trends";
import {
  detectSubscriptions,
  normaliseItem,
  type SuspectedSubscription,
} from "@/lib/subscriptions";
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

// Two years of history: long enough for a seasonal pattern to be visible in a
// sparkline, short enough that a month still reads as a distinct bar.
const ANALYSIS_MONTHS = 24;

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
  const { selectedKeys, anchor } = usePeriod(fallback);

  // Trailing two years ending at the selected month, clamped to the fetched
  // range — deliberately *not* ledger.windowStart/windowEnd, which are a fetch
  // detail the period picker can widen in either direction. See
  // useAnalysisWindow in components/LedgerProvider.tsx.
  const months = useAnalysisWindow(anchor, ANALYSIS_MONTHS);

  const entries = useMemo(
    () => toLedgerEntries(ledger.expenses),
    [ledger.expenses]
  );

  // --- Section 1: Fast vs variabelt ---

  const split = useMemo(
    () => fixedVariableSplit(entries, months),
    [entries, months]
  );
  const maxSplitTotal = useMemo(
    () => Math.max(1, ...split.map((point) => point.fixed + point.variable)),
    [split]
  );

  // --- Section 2: Sparerate ---

  const savings = useMemo(() => savingsRate(entries, months), [entries, months]);
  // rate is null, not 0, for a month with no income (see lib/trends.ts). A
  // null plotted as zero would say "you saved nothing" about a month where
  // the true statement is "we cannot say" — so those months are filtered out
  // of the sparkline entirely (Sparkline's points are a plain number[], it
  // cannot render a break), and the caption below states how many were
  // dropped rather than leaving the gap unexplained.
  const savingsWithRate = useMemo(
    () =>
      savings
        .map((point, index) => ({ point, ref: months[index] }))
        .filter(
          (
            entry
          ): entry is { point: typeof entry.point & { rate: number }; ref: MonthRef } =>
            entry.point.rate !== null
        ),
    [savings, months]
  );
  const savingsSparkPoints = useMemo(
    () => savingsWithRate.map((entry) => entry.point.rate * 100),
    [savingsWithRate]
  );
  const savingsExcludedCount = savings.length - savingsWithRate.length;
  const latestSavings = savings.length ? savings[savings.length - 1] : null;
  const meanSavingsRate = savingsWithRate.length
    ? savingsWithRate.reduce((sum, entry) => sum + entry.point.rate, 0) /
      savingsWithRate.length
    : null;

  // --- Section 3: Kategorier over tid ---

  const series = useMemo(() => categorySeries(entries, months), [entries, months]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // --- Section 4: Abonnementer vi ikke har registrert ---

  // Safe now that `months` ends at the selected month rather than at the
  // fetch edge: these are the six months up to and including the anchor.
  const lastSixMonths = useMemo(() => months.slice(-SUBSCRIPTION_MONTHS), [months]);
  const subscriptionRangeLabel = useMemo(() => {
    if (!lastSixMonths.length) return "";
    const first = lastSixMonths[0];
    const last = lastSixMonths[lastSixMonths.length - 1];
    return `${monthKey(first.year, first.month)}–${monthKey(last.year, last.month)}`;
  }, [lastSixMonths]);
  const subscriptions = useMemo(
    () => detectSubscriptions(entries, ledger.templates, lastSixMonths),
    [entries, ledger.templates, lastSixMonths]
  );
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
      item: sub.item,
      price: sub.typicalAmount,
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

        const currentMonthIds = (currentMonthRows ?? [])
          .filter((row: any) => normaliseItem(row.item) === normalised)
          .map((row: any) => row.id);

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
      <section className="card section-gap">
        <h2 className="section-title">Fast vs variabelt</h2>
        {ledger.loading ? (
          <p className="helper">Laster transaksjoner...</p>
        ) : ledger.error ? (
          <p className="helper">
            Transaksjoner kunne ikke lastes, så fordelingen kan være feil.
          </p>
        ) : (
          <>
            <div className={styles["split-chart"]}>
              {split.map((point, index) => {
                const ref = months[index];
                const total = point.fixed + point.variable;
                const fixedPct = (point.fixed / maxSplitTotal) * 100;
                const variablePct = (point.variable / maxSplitTotal) * 100;
                const isSelected = selectedKeys.has(point.key);
                const monthLabel = FULL_MONTHS[ref.month - 1];
                return (
                  <div
                    key={point.key}
                    className={`${styles["split-col"]} ${isSelected ? styles["active"] : ""}`}
                    // The column is a readout, not a control — nothing here is
                    // clickable, so this stays a div rather than becoming a
                    // button that does nothing. role/aria-label is what makes
                    // the same figures a `title` shows available to a screen
                    // reader, which a bare title attribute is not.
                    role="img"
                    title={`${monthLabel} ${ref.year}: fast ${formatCurrency(point.fixed)}, variabelt ${formatCurrency(point.variable)}, totalt ${formatCurrency(total)}`}
                    aria-label={`${monthLabel} ${ref.year}: fast ${formatCurrency(point.fixed)}, variabelt ${formatCurrency(point.variable)}, totalt ${formatCurrency(total)}`}
                  >
                    <div className={styles["split-track"]}>
                      <div
                        className={styles["split-seg-variable"]}
                        style={{ height: `${variablePct}%`, bottom: `${fixedPct}%` }}
                      />
                      <div
                        className={styles["split-seg-fixed"]}
                        style={{ height: `${fixedPct}%` }}
                      />
                    </div>
                    <span className={styles["split-label"]}>
                      {SHORT_MONTHS[ref.month - 1]}
                      {ref.month === 1 || index === 0 ? (
                        <span className={styles["split-label-year"]}>{ref.year}</span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={styles["split-legend"]}>
              <span className={styles["split-legend-item"]}>
                <span className="breakdown-dot" style={{ background: "var(--accent)" }} />
                Fast
              </span>
              <span className={styles["split-legend-item"]}>
                <span className="breakdown-dot" style={{ background: "var(--expense)" }} />
                Variabelt
              </span>
            </div>
          </>
        )}
      </section>

      <section className="card section-gap">
        <h2 className="section-title">Sparerate</h2>
        {savingsSparkPoints.length ? (
          <div className={styles["savings-layout"]}>
            <div className={styles["savings-chart"]}>
              <Sparkline
                points={savingsSparkPoints}
                ariaLabel="Sparerate over tid"
              />
            </div>
            <div className={styles["savings-stats"]}>
              <div className={styles["savings-stat"]}>
                <span className="helper">Siste måned</span>
                <strong>
                  {latestSavings && latestSavings.rate !== null
                    ? `${Math.round(latestSavings.rate * 100)} %`
                    : "Ingen inntekt"}
                </strong>
              </div>
              <div className={styles["savings-stat"]}>
                <span className="helper">Snitt</span>
                <strong>
                  {meanSavingsRate !== null
                    ? `${Math.round(meanSavingsRate * 100)} %`
                    : "—"}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">Ingen måneder med registrert inntekt i perioden.</div>
        )}
        {savingsExcludedCount > 0 ? (
          <p className="helper">
            {savingsExcludedCount === 1
              ? "1 måned uten registrert inntekt er utelatt fra grafen."
              : `${savingsExcludedCount} måneder uten registrert inntekt er utelatt fra grafen.`}
          </p>
        ) : null}
      </section>

      <section className="card section-gap">
        <h2 className="section-title">Kategorier over tid</h2>
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
                  <Sparkline
                    points={entry.points}
                    ariaLabel={`Utvikling for ${entry.category}`}
                  />
                  <span className={styles["category-tile-stats"]}>
                    <span>Totalt {formatCurrency(entry.total)}</span>
                    <span>Snitt {formatCurrency(Math.round(entry.mean))}</span>
                    <span>Median {formatCurrency(Math.round(entry.median))}</span>
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
        <h2 className="section-title">Abonnementer vi ikke har registrert</h2>
        {subscriptionStatus ? <div className="status">{subscriptionStatus}</div> : null}
        {subscriptions.length ? (
          <div className={styles["subscription-table"]}>
            <div className={styles["subscription-head"]}>
              <span>Vare</span>
              <span>Kategori</span>
              <span>Måneder sett</span>
              <span>Pr. måned</span>
              <span>Pr. år</span>
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
                  <span>{sub.monthsSeen}</span>
                  <span>{formatCurrency(sub.monthlyCost)}</span>
                  <span>{formatCurrency(sub.annualCost)}</span>
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

      <CategoryDrilldown
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
        anchor={anchor}
      />
    </>
  );
}
