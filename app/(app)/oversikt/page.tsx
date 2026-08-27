"use client";

import { useCallback, useMemo, useState } from "react";
import { useLedger, useLedgerSelection } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { periodLabel } from "@/lib/period";
import { categoryColor, getCategorySlot } from "@/lib/categoryColor";
import { GaugeArc, ShareBar, type ShareSegment } from "@/components/charts";
import { formatCurrency, toNumber } from "@/lib/format";
import { monthKey, type MonthRef } from "@/lib/insights";
import {
  isIncomeKind,
  isSavingsKind,
  isSpendingKind,
  type CategoryKind,
} from "@/lib/categories";
import styles from "./oversikt.module.css";

type Category = {
  id: number;
  category: string;
  kind: CategoryKind;
};

type BudgetEntry = {
  id: number;
  category_id: number;
  budget: number;
  year: number;
  month: number;
  user_id?: string | null;
  category: Category | null;
};

export default function OversiktPage() {
  const ledger = useLedger();
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, selectedList, single } = usePeriod(fallback);
  const expenses = useLedgerSelection(selectedKeys);

  const [activeShare, setActiveShare] = useState<string | null>(null);

  const hasPeriod = selectedList.length > 0;

  // The label for the selected period, shared with /innsikt via lib/period.ts.
  const label = periodLabel(selectedList);

  const categoryByName = useMemo(() => {
    const map = new Map<string, Category>();
    ledger.categories.forEach((category) => {
      map.set(category.category, category);
    });
    return map;
  }, [ledger.categories]);
  // Some derived views key on category name rather than id. Unknown names
  // (the "Ukategorisert" fallback) behave as ordinary spending.
  const kindOfCategory = useCallback(
    (name: string): CategoryKind => categoryByName.get(name)?.kind ?? "variable",
    [categoryByName]
  );

  const summary = useMemo(() => {
    let income = 0;
    let expensesTotal = 0;
    let savings = 0;

    expenses.forEach((expense) => {
      const value = toNumber(expense.price);
      const categoryName = expense.category?.category ?? "";
      const kind = kindOfCategory(categoryName);
      if (isIncomeKind(kind)) {
        income += value;
      } else if (isSpendingKind(kind)) {
        expensesTotal += value;
      } else if (isSavingsKind(kind)) {
        // Excluded from expensesTotal (which feeds the budget gauge, whose
        // denominator already excludes savings budgets — see budgetSummary
        // below) but still tracked, not silently dropped.
        savings += value;
      }
    });

    return {
      income,
      expensesTotal,
      savings,
      net: income - expensesTotal,
      count: expenses.length,
    };
  }, [expenses, kindOfCategory]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    ledger.categories.forEach((category) => {
      totals.set(category.category, 0);
    });
    expenses.forEach((expense) => {
      const key = expense.category?.category || "Ukategorisert";
      totals.set(key, (totals.get(key) ?? 0) + toNumber(expense.price));
    });

    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, total, kind: kindOfCategory(name) }))
      .sort((a, b) => {
        const aIncome = isIncomeKind(a.kind);
        const bIncome = isIncomeKind(b.kind);
        if (aIncome !== bIncome) {
          return aIncome ? -1 : 1;
        }
        return b.total - a.total;
      });
  }, [ledger.categories, expenses, kindOfCategory]);

  const budgetByCategoryName = useMemo(() => {
    const map = new Map<string, number>();

    if (!hasPeriod) return map;

    ledger.categories.forEach((category) => {
      map.set(category.category, 0);
    });

    ledger.budgets.forEach((entry) => {
      if (!selectedKeys.has(monthKey(entry.year, entry.month))) return;
      const name = entry.category?.category;
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + entry.budget);
    });

    return map;
  }, [ledger.budgets, ledger.categories, hasPeriod, selectedKeys]);
  const budgetSummary = useMemo(() => {
    if (!hasPeriod) {
      return { budgetTotal: 0, percentUsed: 0, remaining: 0, daysLeft: 0, dailyBudget: 0, projected: 0 };
    }

    let budgetTotal = 0;

    ledger.budgets.forEach((entry) => {
      const name = entry.category?.category;
      if (!name || !isSpendingKind(kindOfCategory(name))) return;
      if (!selectedKeys.has(monthKey(entry.year, entry.month))) return;
      budgetTotal += entry.budget;
    });

    const percentUsed =
      budgetTotal > 0 ? (summary.expensesTotal / budgetTotal) * 100 : 0;
    const remaining = budgetTotal - summary.expensesTotal;

    // Daily-budget pacing only makes sense for a single concrete month.
    let daysLeft = 0;
    let dailyBudget = 0;
    // Month-end forecast at the current burn rate. Only for the month in
    // progress: a past month is already its own total, and a future month has
    // no elapsed days to extrapolate from.
    let projected = 0;
    if (single) {
      const y = single.year;
      const m = single.month;
      const totalDays = new Date(y, m, 0).getDate();
      const now = new Date();
      if (y === now.getFullYear() && m === now.getMonth() + 1) {
        daysLeft = Math.max(totalDays - now.getDate(), 0);
        projected = Math.round((summary.expensesTotal / now.getDate()) * totalDays);
      } else if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) {
        daysLeft = totalDays;
      }
      dailyBudget = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
    }

    return { budgetTotal, percentUsed, remaining, daysLeft, dailyBudget, projected };
  }, [ledger.budgets, hasPeriod, kindOfCategory, selectedKeys, single, summary.expensesTotal]);

  const budgetInsights = useMemo(() => {
    if (!hasPeriod) return null;

    const categoriesWithBudget: { name: string; spent: number; budget: number; percent: number }[] = [];

    categoryTotals.forEach((cat) => {
      if (!isSpendingKind(cat.kind)) return;
      const bv = budgetByCategoryName.get(cat.name) ?? 0;
      if (bv <= 0) return;
      const pct = (cat.total / bv) * 100;
      categoriesWithBudget.push({ name: cat.name, spent: cat.total, budget: bv, percent: pct });
    });

    if (!categoriesWithBudget.length) return null;

    const underCount = categoriesWithBudget.filter((c) => c.percent <= 100).length;
    const overCount = categoriesWithBudget.length - underCount;
    const worst = [...categoriesWithBudget].sort((a, b) => b.percent - a.percent)[0];

    return { total: categoriesWithBudget.length, underCount, overCount, worst };
  }, [budgetByCategoryName, categoryTotals, hasPeriod]);

  const expenseBreakdown = useMemo(() => {
    const items: ShareSegment[] = [];
    let expenseSum = 0;
    categoryTotals.forEach((cat) => {
      if (!isSpendingKind(cat.kind) || cat.total <= 0) return;
      items.push({
        key: cat.name,
        label: cat.name,
        value: cat.total,
        color: categoryColor(getCategorySlot(cat.name)),
      });
      expenseSum += cat.total;
    });
    return { items, total: expenseSum };
  }, [categoryTotals]);

  return (
    <>
      {budgetSummary.budgetTotal > 0 ? (
        <section className={`card section-gap ${styles["gauge-card"]}`}>
          <div className="card-head">
            <h2 className="section-title">Budsjett</h2>
            <span className="helper">{label}</span>
          </div>
          <div className={styles["gauge-layout"]}>
            {/* Two states, not three. The amber 75–100 % band said "careful"
                about a month that is still inside its budget, in a third colour
                on the loudest element on the page; being at 80 % on the 25th is
                simply fine. Over budget is the one thing worth a colour change,
                and it gets the second lap inside the ring as well as the red. */}
            <GaugeArc
              fraction={budgetSummary.percentUsed / 100}
              color={
                budgetSummary.percentUsed > 100
                  ? "var(--expense)"
                  : "var(--income)"
              }
            >
              <span
                className={styles["gauge-pct"]}
                style={{
                  color:
                    budgetSummary.percentUsed > 100
                      ? "var(--expense)"
                      : "var(--income)",
                }}
              >
                {budgetSummary.percentUsed.toFixed(0)}%
              </span>
              <span className={styles["gauge-label"]}>brukt</span>
            </GaugeArc>
            <div className={styles["gauge-details"]}>
              <div className={styles["gauge-main-figure"]}>
                <span className="stat-label">Brukt av budsjett</span>
                <strong>
                  {formatCurrency(summary.expensesTotal)}
                  <span className={styles["gauge-main-total"]}>
                    {" "}
                    / {formatCurrency(budgetSummary.budgetTotal)}
                  </span>
                </strong>
              </div>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-label">
                    {budgetSummary.remaining >= 0 ? "Gjenstår" : "Over budsjett"}
                  </span>
                  <strong className={`stat-value ${budgetSummary.remaining >= 0 ? "is-good" : "is-bad"}`}>
                    {budgetSummary.remaining >= 0
                      ? formatCurrency(budgetSummary.remaining)
                      : `-${formatCurrency(Math.abs(budgetSummary.remaining))}`}
                  </strong>
                </div>
                {budgetSummary.daysLeft > 0 && budgetSummary.remaining > 0 ? (
                  <div className="stat">
                    <span className="stat-label">Per dag</span>
                    <strong className="stat-value">
                      {formatCurrency(Math.round(budgetSummary.dailyBudget))}
                    </strong>
                    <span className="helper">{budgetSummary.daysLeft} dager igjen</span>
                  </div>
                ) : null}
                {budgetSummary.projected > 0 ? (
                  <div className="stat">
                    <span className="stat-label">Prognose</span>
                    <strong
                      className={`stat-value ${
                        budgetSummary.projected > budgetSummary.budgetTotal
                          ? "is-bad"
                          : "is-good"
                      }`}
                    >
                      {formatCurrency(budgetSummary.projected)}
                    </strong>
                    <span className="helper">
                      {budgetSummary.projected > budgetSummary.budgetTotal
                        ? `${formatCurrency(budgetSummary.projected - budgetSummary.budgetTotal)} over budsjett`
                        : `${formatCurrency(budgetSummary.budgetTotal - budgetSummary.projected)} under budsjett`}
                    </span>
                  </div>
                ) : null}
              </div>
              {budgetInsights ? (
                <div className={styles["gauge-insights"]}>
                  {budgetInsights.overCount === 0 ? (
                    <span className={`${styles["insight-chip"]} ${styles["insight-good"]}`}>Alle {budgetInsights.total} kategorier er under budsjett</span>
                  ) : (
                    <span className={`${styles["insight-chip"]} ${styles["insight-warn"]}`}>{budgetInsights.overCount} av {budgetInsights.total} kategorier er over budsjett</span>
                  )}
                  {budgetInsights.worst && budgetInsights.worst.percent > 100 ? (
                    <span className={`${styles["insight-chip"]} ${styles["insight-bad"]}`}>{budgetInsights.worst.name}: {budgetInsights.worst.percent.toFixed(0)}% brukt</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {expenseBreakdown.items.length > 0 ? (
        <section className="card section-gap">
          <div className="card-head">
            <h2 className="section-title">Fordeling</h2>
            <span className="helper">{formatCurrency(expenseBreakdown.total)}</span>
          </div>
          {/* Bar and legend share one hover state, so pointing at either
              highlights both — the legend used to be the only place a category
              was named, and the bar the only place its size was visible. */}
          <ShareBar
            segments={expenseBreakdown.items}
            formatValue={formatCurrency}
            activeKey={activeShare}
            onActiveKey={setActiveShare}
            ariaLabel={`Utgifter fordelt på ${expenseBreakdown.items.length} kategorier`}
          />
          <div className={styles["breakdown-legend"]}>
            {expenseBreakdown.items.map((item) => {
              const pct = (item.value / expenseBreakdown.total) * 100;
              return (
                <div
                  key={item.key}
                  className={styles["breakdown-legend-item"]}
                  data-dim={
                    activeShare && activeShare !== item.key ? "true" : undefined
                  }
                  onMouseEnter={() => setActiveShare(item.key)}
                  onMouseLeave={() => setActiveShare(null)}
                >
                  <span className="breakdown-dot" style={{ background: item.color }} />
                  <span className={styles["breakdown-legend-name"]}>{item.label}</span>
                  <span className={styles["breakdown-legend-value"]}>{formatCurrency(item.value)}</span>
                  <span className={styles["breakdown-legend-pct"]}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Both sections above are conditional, and the category list that used to
          render unconditionally now lives on /budsjett — so without this a month
          with no budget and no spending is a blank page, which reads as a
          failure rather than as an empty month. */}
      {budgetSummary.budgetTotal <= 0 && expenseBreakdown.items.length === 0 ? (
        <section className="card section-gap">
          <div className="card-head">
            <h2 className="section-title">Ingenting å vise</h2>
            <span className="helper">{label}</span>
          </div>
          <p className="helper">
            {ledger.loading
              ? "Laster..."
              : "Ingen føringer eller budsjett for denne perioden. Legg inn transaksjoner under Transaksjoner, eller sett et budsjett under Budsjett."}
          </p>
        </section>
      ) : null}
    </>
  );
}
