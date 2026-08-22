"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  useLedger,
  useLedgerHistory,
  useLedgerSelection,
} from "@/components/LedgerProvider";
import MonthOverMonth from "@/components/MonthOverMonth";
import Anomalies from "@/components/Anomalies";
import CategoryDrilldown from "@/components/CategoryDrilldown";
import { usePeriod } from "@/lib/usePeriod";
import { getCategoryHue } from "@/lib/categoryColor";
import { IconChevronDown, IconPencil } from "@/components/icons";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, toNumber } from "@/lib/format";
import { monthKey, type MonthRef } from "@/lib/insights";
import {
  CATEGORY_KINDS,
  KIND_LABELS,
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

function getPreviousPeriod(year: number, month: number) {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

export default function OversiktPage() {
  const ledger = useLedger();
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, selectedList, single, anchor } = usePeriod(fallback);
  const historyEntries = useLedgerHistory(anchor);
  const expenses = useLedgerSelection(selectedKeys);

  const [budgetStatus, setBudgetStatus] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetHasValue, setBudgetHasValue] = useState(false);
  const [previousBudgetValue, setPreviousBudgetValue] = useState<number | null>(
    null
  );
  const [previousBudgetLabel, setPreviousBudgetLabel] = useState("");
  const [previousBudgetLoading, setPreviousBudgetLoading] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  const hasPeriod = selectedList.length > 0;

  const allMonthOptions = useMemo(
    () => [
      { value: "1", label: "januar" },
      { value: "2", label: "februar" },
      { value: "3", label: "mars" },
      { value: "4", label: "april" },
      { value: "5", label: "mai" },
      { value: "6", label: "juni" },
      { value: "7", label: "juli" },
      { value: "8", label: "august" },
      { value: "9", label: "september" },
      { value: "10", label: "oktober" },
      { value: "11", label: "november" },
      { value: "12", label: "desember" },
    ],
    []
  );
  const selectedMonthLabel = useMemo(() => {
    if (!single) return "";
    return (
      allMonthOptions.find((month) => Number(month.value) === single.month)
        ?.label ?? ""
    );
  }, [allMonthOptions, single]);
  const periodLabel = useMemo(() => {
    if (!selectedList.length) return "Ingen periode";
    if (selectedList.length === 1) {
      const ref = selectedList[0];
      const label =
        allMonthOptions.find((month) => Number(month.value) === ref.month)
          ?.label ?? String(ref.month);
      return `${label} ${ref.year}`;
    }
    const years = new Set(selectedList.map((ref) => ref.year));
    if (years.size === 1) {
      const year = selectedList[0].year;
      if (selectedList.length === 12) return String(year);
      return `${selectedList.length} måneder ${year}`;
    }
    return `${selectedList.length} måneder valgt`;
  }, [allMonthOptions, selectedList]);

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
  const maxCategoryAmount = useMemo(() => {
    let maxValue = 0;

    categoryTotals.forEach((category) => {
      maxValue = Math.max(maxValue, category.total);
      if (hasPeriod) {
        maxValue = Math.max(
          maxValue,
          budgetByCategoryName.get(category.name) ?? 0
        );
      }
    });

    return Math.max(maxValue, 1);
  }, [budgetByCategoryName, categoryTotals, hasPeriod]);

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
    const items: { name: string; total: number; hue: number }[] = [];
    let expenseSum = 0;
    categoryTotals.forEach((cat) => {
      if (!isSpendingKind(cat.kind) || cat.total <= 0) return;
      items.push({ name: cat.name, total: cat.total, hue: getCategoryHue(cat.name) });
      expenseSum += cat.total;
    });
    return { items, total: expenseSum };
  }, [categoryTotals]);

  // The row also contains the budget-edit pencil button and, while editing,
  // an input plus Avbryt/Lagre/Kopier buttons in the popover. None of those
  // clicks should also open the drill-down — guarded on the event target,
  // the same idea as the activity table row's onKeyDown guard
  // (event.target !== event.currentTarget) in
  // app/(app)/transaksjoner/page.tsx, adapted for click bubbling through the
  // row's own text and bars rather than requiring an exact target match.
  // The popover also contains non-interactive content (the "Budsjett for
  // {måned}" label, the popover's own row divs) that the closest("button,
  // input") guard does not match, so bail on the editing state first —
  // checking editingCategory is more robust than enumerating popover
  // selectors, because it cannot drift as the popover markup changes.
  function handleCategoryRowClick(
    event: React.MouseEvent<HTMLDivElement>,
    categoryName: string
  ) {
    if (editingCategory === categoryName) return;
    if ((event.target as HTMLElement).closest("button, input")) return;
    setDrilldownCategory(categoryName);
  }

  function handleCategoryRowKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    categoryName: string
  ) {
    if (editingCategory === categoryName) return;
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setDrilldownCategory(categoryName);
    }
  }

  async function handleOpenBudgetEditor(categoryName: string) {
    if (!single) {
      setBudgetStatus("Velg én måned for å redigere budsjett.");
      return;
    }

    const category = categoryByName.get(categoryName);
    if (!category) return;

    setBudgetStatus(null);
    const monthValue = single.month;
    const yearValue = single.year;
    const existing = ledger.budgets.find(
      (entry) =>
        entry.category_id === category.id &&
        entry.month === monthValue &&
        entry.year === yearValue
    );

    setBudgetHasValue(Boolean(existing));
    setBudgetDraft(existing ? String(existing.budget) : "");
    setEditingCategory(categoryName);
    setPreviousBudgetValue(null);
    setPreviousBudgetLabel("");
    setPreviousBudgetLoading(false);

    if (existing) return;

    const previous = getPreviousPeriod(yearValue, monthValue);
    const previousLabel =
      allMonthOptions.find((month) => Number(month.value) === previous.month)
        ?.label ?? "";
    setPreviousBudgetLabel(`${previousLabel} ${previous.year}`);
    setPreviousBudgetLoading(true);

    let previousBudget = ledger.budgets.find(
      (entry) =>
        entry.category_id === category.id &&
        entry.month === previous.month &&
        entry.year === previous.year
    );

    if (!previousBudget && previous.year !== yearValue) {
      // The previous period can fall outside the provider's fetched budget
      // set (the prior December when editing January), so this one read
      // legitimately stays a direct query rather than a ledger lookup.
      const { data, error } = await supabase
        .from("budget")
        .select("budget")
        .eq("user_id", ledger.userId)
        .eq("category_id", category.id)
        .eq("year", previous.year)
        .eq("month", previous.month)
        .maybeSingle();
      if (!error && data) {
        previousBudget = { budget: data.budget } as BudgetEntry;
      }
    }

    setPreviousBudgetValue(previousBudget?.budget ?? null);
    setPreviousBudgetLoading(false);
  }

  // The kind drives every split in the app (spending vs income vs savings), so
  // it needs an editor somewhere. The budget popover is where a category is
  // already being configured, which is cheaper than a settings route nobody
  // would visit twice.
  async function handleChangeKind(categoryName: string, kind: CategoryKind) {
    const category = categoryByName.get(categoryName);
    if (!category) return;

    setBudgetStatus(null);
    const { error } = await supabase
      .from("category")
      .update({ kind })
      .eq("id", category.id)
      .eq("user_id", ledger.userId);

    if (error) {
      setBudgetStatus(error.message);
      return;
    }
    await ledger.refetch();
  }

  async function handleSaveBudget() {
    if (!editingCategory || !single) return;

    const category = categoryByName.get(editingCategory);
    if (!category) return;

    const monthValue = single.month;
    const yearValue = single.year;
    const parsed = Number(budgetDraft);
    const budgetValue = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    const existing = ledger.budgets.find(
      (entry) =>
        entry.category_id === category.id &&
        entry.month === monthValue &&
        entry.year === yearValue
    );

    setBudgetSaving(true);
    setBudgetStatus(null);

    let error = null;
    if (existing?.id) {
      const result = await supabase
        .from("budget")
        .update({ budget: budgetValue })
        .eq("id", existing.id)
        .eq("user_id", ledger.userId);
      error = result.error;
    } else {
      const result = await supabase.from("budget").insert({
        category_id: category.id,
        budget: budgetValue,
        year: yearValue,
        month: monthValue,
        user_id: ledger.userId,
      });
      error = result.error;
    }

    if (error) {
      setBudgetStatus(error.message);
    } else {
      await ledger.refetch();
      setEditingCategory(null);
    }

    setBudgetSaving(false);
  }

  return (
    <>
      {budgetSummary.budgetTotal > 0 ? (
        <section className={`card section-gap ${styles["gauge-card"]}`} style={{
          "--gauge-pct": Math.min(budgetSummary.percentUsed, 100),
          "--gauge-color": budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "var(--gauge-warn)" : "var(--income)",
        } as CSSProperties}>
          <div className="card-head">
            <h2 className="section-title">Budsjett</h2>
            <span className="helper">{periodLabel}</span>
          </div>
          <div className={styles["gauge-layout"]}>
            <div className={styles["gauge-ring-wrap"]}>
              <div className={styles["gauge-ring"]} />
              <div className={styles["gauge-center"]}>
                <span className={styles["gauge-pct"]} style={{
                  color: budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "var(--gauge-warn-ink)" : "var(--income)",
                }}>
                  {budgetSummary.percentUsed.toFixed(0)}%
                </span>
                <span className={styles["gauge-label"]}>brukt</span>
              </div>
            </div>
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
          <h2 className="section-title">Fordeling</h2>
          <div className={styles["breakdown-bar"]}>
            {expenseBreakdown.items.map((item) => {
              const pct = (item.total / expenseBreakdown.total) * 100;
              return (
                <div
                  key={item.name}
                  className={styles["breakdown-segment"]}
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    background: `hsl(${item.hue} var(--seg-s) var(--seg-l))`,
                  } as CSSProperties}
                  title={`${item.name}: ${formatCurrency(item.total)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className={styles["breakdown-legend"]}>
            {expenseBreakdown.items.map((item) => {
              const pct = (item.total / expenseBreakdown.total) * 100;
              return (
                <div key={item.name} className={styles["breakdown-legend-item"]}>
                  <span className="breakdown-dot" style={{ background: `hsl(${item.hue} var(--seg-s) var(--seg-l))` }} />
                  <span className={styles["breakdown-legend-name"]}>{item.name}</span>
                  <span className={styles["breakdown-legend-value"]}>{formatCurrency(item.total)}</span>
                  <span className={styles["breakdown-legend-pct"]}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <MonthOverMonth entries={historyEntries} single={single} />

      <Anomalies
        entries={historyEntries}
        selected={single}
        periodLabel={periodLabel}
        templates={ledger.templates}
      />

      <section
        className={`card section-gap ${styles["category-card"]}${editingCategory ? ` ${styles["editing"]}` : ""}`}
      >
        <div className="card-head">
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setCategoriesCollapsed((value) => !value)}
            aria-expanded={!categoriesCollapsed}
            aria-controls="category-list"
          >
            <span className={`collapse-chevron ${categoriesCollapsed ? "collapsed" : ""}`}>
              <IconChevronDown />
            </span>
            <h2 className="section-title">Kategorier</h2>
          </button>
          <span className="helper">{periodLabel}</span>
        </div>
        {!categoriesCollapsed ? (
          <>
            {budgetStatus ? <div className="status">{budgetStatus}</div> : null}
            {categoryTotals.length ? (
              <div className={styles["category-chart-list"]} id="category-list">
              {categoryTotals.map((category) => {
                const isIncome = isIncomeKind(category.kind);
                const budgetValue =
                  budgetByCategoryName.get(category.name) ?? 0;
                const hasBudget = budgetValue > 0;
                const percentUsed =
                  budgetValue > 0 ? (category.total / budgetValue) * 100 : 0;
                const isOverBudget = hasBudget && percentUsed > 100;
                const remaining = budgetValue - category.total;

                const barScale = hasBudget ? budgetValue : maxCategoryAmount;
                const spentWidth =
                  category.total > 0
                    ? Math.max(Math.min((category.total / barScale) * 100, 100), 1.8)
                    : 0;

                const categoryBudgetStateClass =
                  !isIncome && hasBudget
                    ? isOverBudget
                      ? "over-budget"
                      : "under-budget"
                    : "";
                const spentBarStateClass = isIncome
                  ? "income"
                  : hasBudget
                    ? isOverBudget
                      ? "over"
                      : "under-budget"
                    : "no-budget";
                const isEditing = editingCategory === category.name;
                const canEditBudget = Boolean(single);
                const catHue = getCategoryHue(category.name);
                return (
                  <div
                    key={category.name}
                    className={`${styles["category-chart-row"]} ${
                      isEditing ? styles["is-editing"] : ""
                    } ${styles[categoryBudgetStateClass] ?? ""}`}
                    tabIndex={0}
                    onClick={(event) => handleCategoryRowClick(event, category.name)}
                    onKeyDown={(event) => handleCategoryRowKeyDown(event, category.name)}
                    title={`Vis historikk for ${category.name}`}
                    aria-label={`Vis historikk for ${category.name}`}
                  >
                    <div className={styles["category-chart-header"]}>
                      <div className={styles["cat-name-row"]}>
                        <span className={styles["cat-dot"]} style={{
                          background: isIncome
                            ? "var(--income)"
                            : `hsl(${catHue} var(--dot-s) var(--dot-l))`,
                        }} />
                        <strong className={isIncome ? "text-income" : ""}>
                          {category.name}
                        </strong>
                      </div>
                      <div className={styles["category-chart-values"]}>
                        <span className={styles["category-value"]}>
                          {formatCurrency(category.total)}
                        </span>
                        {hasPeriod && hasBudget && !isIncome ? (
                          <>
                            <span className={`${styles["category-value"]} helper`}>
                              / {formatCurrency(budgetValue)}
                            </span>
                            <span className={`${styles["cat-remaining"]} ${isOverBudget ? "text-expense" : "text-income"}`}>
                              {isOverBudget
                                ? `${formatCurrency(Math.abs(remaining))} over`
                                : `${formatCurrency(remaining)} igjen`}
                            </span>
                          </>
                        ) : hasPeriod && !isIncome ? (
                          <span className={`${styles["category-value"]} helper`}>Budsjett ikke satt</span>
                        ) : null}
                      </div>
                      <span className={styles["cat-pct-slot"]}>
                        {hasBudget && !isIncome ? (
                          <span className={`${styles["cat-pct-badge"]} ${isOverBudget ? styles["cat-pct-over"] : percentUsed > 75 ? styles["cat-pct-warn"] : styles["cat-pct-ok"]}`}>
                            {percentUsed.toFixed(0)}%
                          </span>
                        ) : null}
                      </span>
                      <button
                        className="icon-btn"
                        type="button"
                        onClick={() => handleOpenBudgetEditor(category.name)}
                        disabled={!canEditBudget}
                        title={
                          canEditBudget ? "Rediger budsjett" : "Velg én måned"
                        }
                        aria-label={`Rediger budsjett for ${category.name}`}
                      >
                        <IconPencil />
                      </button>
                    </div>
                    {isEditing ? (
                      <div className={styles["budget-popover"]}>
                        <div className={styles["budget-popover-row"]}>
                          <span className="helper">
                            Budsjett for {selectedMonthLabel}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={budgetDraft}
                            onChange={(event) =>
                              setBudgetDraft(event.target.value)
                            }
                          />
                        </div>
                        {!budgetHasValue ? (
                          <div className={styles["budget-popover-row"]}>
                            <span className="helper">
                              {previousBudgetLabel
                                ? `Forrige periode: ${previousBudgetLabel}`
                                : "Forrige periode"}
                            </span>
                            {previousBudgetLoading ? (
                              <span className="helper">Henter budsjett...</span>
                            ) : previousBudgetValue !== null ? (
                              <button
                                className="btn btn-ghost btn-small"
                                type="button"
                                onClick={() =>
                                  setBudgetDraft(String(previousBudgetValue))
                                }
                              >
                                Kopier {formatCurrency(previousBudgetValue)}
                              </button>
                            ) : (
                              <span className="helper">
                                Ingen budsjett funnet
                              </span>
                            )}
                          </div>
                        ) : null}
                        <div className={styles["budget-popover-row"]}>
                          <span className="helper">Type</span>
                          <select
                            value={category.kind}
                            onChange={(event) =>
                              handleChangeKind(
                                category.name,
                                event.target.value as CategoryKind
                              )
                            }
                            aria-label={`Type for ${category.name}`}
                          >
                            {CATEGORY_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {KIND_LABELS[kind]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles["budget-popover-actions"]}>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => setEditingCategory(null)}
                          >
                            Avbryt
                          </button>
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={handleSaveBudget}
                            disabled={budgetSaving}
                          >
                            {budgetSaving ? "Lagrer..." : "Lagre"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className={styles["category-chart-track"]} style={{
                      "--bar-color": isIncome
                        ? "var(--income)"
                        : hasBudget
                          ? isOverBudget
                            ? "var(--expense)"
                            : "var(--income)"
                          : `hsl(${catHue} var(--bar-s) var(--bar-l))`,
                    } as CSSProperties}>
                      <div
                        className={`${styles["category-chart-bar"]} ${styles["spent"]} ${styles[spentBarStateClass] ?? ""}`}
                        style={{
                          width: `${spentWidth}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              </div>
            ) : (
              <div className="empty">Ingen kategorier</div>
            )}
          </>
        ) : null}
      </section>

      <CategoryDrilldown
        category={drilldownCategory}
        onClose={() => setDrilldownCategory(null)}
        anchor={anchor}
      />
    </>
  );
}
