"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import BudgetSummary from "@/components/BudgetSummary";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, formatDate, toNumber } from "@/lib/format";

type Filters = {
  year: string;
  month: string;
};

type Category = {
  id: number;
  category: string;
};

type Expense = {
  id: number;
  item: string;
  price: number | string;
  category_id: number;
  tag: string | null;
  user_id: string | null;
  date: string | null;
  category: Category | null;
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

const incomeCategoryLabel = "inntekter";

function isIncomeCategory(name: string) {
  return name.trim().toLowerCase() === incomeCategoryLabel;
}

function getCategoryHue(name: string) {
  const normalized = name.trim().toLowerCase() || "uncategorized";
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
  }
  return Math.abs(hash);
}

function formatDateParts(year: number, month: number, day: number) {
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  return `${year}-${monthValue}-${dayValue}`;
}

function getPreviousPeriod(year: number, month: number) {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

function VisualizeContent({ session }: { session: Session }) {
  const today = new Date();
  const currentYear = String(today.getFullYear());
  const currentMonth = String(today.getMonth() + 1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetHasValue, setBudgetHasValue] = useState(false);
  const [previousBudgetValue, setPreviousBudgetValue] = useState<number | null>(
    null
  );
  const [previousBudgetLabel, setPreviousBudgetLabel] = useState("");
  const [previousBudgetLoading, setPreviousBudgetLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>({
    year: currentYear,
    month: currentMonth,
  });
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableMonthsByYear, setAvailableMonthsByYear] = useState<
    Record<string, string[]>
  >({});
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
  const yearOptions = useMemo(() => {
    if (availableYears.length) return availableYears;
    return [currentYear];
  }, [availableYears, currentYear]);
  const filterMonthOptions = useMemo(() => {
    if (!filters.year) return allMonthOptions;
    const available = availableMonthsByYear[filters.year];
    if (!available?.length) return allMonthOptions;
    return allMonthOptions.filter((month) => available.includes(month.value));
  }, [allMonthOptions, availableMonthsByYear, filters.year]);
  const monthsForSelectedYear = useMemo(() => {
    if (!filters.year) return [];
    return availableMonthsByYear[filters.year] ?? [];
  }, [availableMonthsByYear, filters.year]);
  const selectedMonthLabel = useMemo(() => {
    if (!filters.month) return "";
    return (
      allMonthOptions.find((month) => month.value === filters.month)?.label ??
      ""
    );
  }, [allMonthOptions, filters.month]);
  const periodLabel = useMemo(() => {
    if (!filters.year) return "Alle år";
    if (!filters.month) return filters.year;
    const label = selectedMonthLabel || filters.month;
    return `${label} ${filters.year}`;
  }, [filters.month, filters.year, selectedMonthLabel]);
  useEffect(() => {
    let active = true;

    async function loadExpenseMeta() {
      const { data, error } = await supabase
        .from("expense")
        .select("date")
        .eq("user_id", session.user.id);

      if (!active) return;

      if (error) {
        setBudgetStatus(error.message);
        return;
      }

      const years = new Set<string>();
      const monthsByYear: Record<string, Set<string>> = {};

      (data ?? []).forEach((entry) => {
        if (!entry.date) return;
        const [yearValue, monthValue] = entry.date.split("-");
        if (!yearValue || !monthValue) return;
        years.add(yearValue);
        if (!monthsByYear[yearValue]) {
          monthsByYear[yearValue] = new Set();
        }
        monthsByYear[yearValue].add(String(Number(monthValue)));
      });

      const sortedYears = Array.from(years).sort(
        (a, b) => Number(b) - Number(a)
      );
      const normalizedMonths: Record<string, string[]> = {};
      Object.entries(monthsByYear).forEach(([year, months]) => {
        normalizedMonths[year] = Array.from(months).sort(
          (a, b) => Number(a) - Number(b)
        );
      });

      setAvailableYears(sortedYears);
      setAvailableMonthsByYear(normalizedMonths);
    }

    loadExpenseMeta();

    return () => {
      active = false;
    };
  }, [session.user.id]);

  useEffect(() => {
    if (!availableYears.length) return;

    setFilters((prev) => {
      let nextYear = prev.year;
      if (!nextYear || !availableYears.includes(nextYear)) {
        nextYear = availableYears[0];
      }

      let nextMonth = prev.month;
      if (nextYear) {
        const availableMonths = availableMonthsByYear[nextYear];
        if (availableMonths?.length && !availableMonths.includes(nextMonth)) {
          nextMonth = availableMonths.includes(currentMonth)
            ? currentMonth
            : availableMonths[0];
        }
      } else {
        nextMonth = "";
      }

      if (nextYear === prev.year && nextMonth === prev.month) {
        return prev;
      }

      return {
        ...prev,
        year: nextYear,
        month: nextMonth,
      };
    });
  }, [availableMonthsByYear, availableYears, currentMonth]);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      const { data, error } = await supabase
        .from("category")
        .select("id, category")
        .order("category", { ascending: true });

      if (!active) return;

      if (error) {
        setBudgetStatus(error.message);
      } else {
        setCategories(data ?? []);
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  async function fetchBudgets(yearValue: number) {
    setBudgetStatus(null);

    const { data, error } = await supabase
      .from("budget")
      .select("id, category_id, budget, year, month, category(id, category)")
      .eq("year", yearValue)
      .order("month", { ascending: true });

    if (error) {
      setBudgetStatus(error.message);
    } else {
      // Supabase may return the joined `category` as an array; normalize to a single object or null.
      const normalized = (data ?? []).map((entry: any) => {
        const category = Array.isArray(entry.category)
          ? entry.category[0] ?? null
          : entry.category ?? null;
        return {
          ...entry,
          category,
        } as BudgetEntry;
      });
      setBudgets(normalized);
    }
  }

  useEffect(() => {
    if (!filters.year) return;
    fetchBudgets(Number(filters.year));
  }, [filters.year]);

  useEffect(() => {
    let active = true;

    async function loadExpenses() {
      setLoading(true);
      setStatus(null);

      let query = supabase
        .from("expense")
        .select(
          "id, item, price, category_id, tag, user_id, date, category(id, category)"
        )
        .eq("user_id", session.user.id)
        .order("id", { ascending: false });

      if (filters.year) {
        if (filters.month) {
          const monthValue = Number(filters.month);
          if (Number.isFinite(monthValue)) {
            const yearValue = Number(filters.year);
            const lastDay = new Date(yearValue, monthValue, 0).getDate();
            const monthStart = formatDateParts(yearValue, monthValue, 1);
            const monthEnd = formatDateParts(yearValue, monthValue, lastDay);
            query = query.gte("date", monthStart);
            query = query.lte("date", monthEnd);
          }
        } else {
          const yearStart = `${filters.year}-01-01`;
          const yearEnd = `${filters.year}-12-31`;

          query = query.gte("date", yearStart);
          query = query.lte("date", yearEnd);
        }
      }

      const { data, error } = await query;

      if (!active) return;

      if (error) {
        setStatus(error.message);
        setExpenses([]);
      } else {
        // Normalize the returned rows: Supabase may return the joined `category` as an array.
        const normalized = (data ?? []).map((entry: any) => {
          const category = Array.isArray(entry.category)
            ? entry.category[0] ?? null
            : entry.category ?? null;
          return { ...entry, category } as Expense;
        });
        setExpenses(normalized);
      }

      setLoading(false);
    }

    loadExpenses();

    return () => {
      active = false;
    };
  }, [session.user.id, filters.year, filters.month]);

  const summary = useMemo(() => {
    let income = 0;
    let expensesTotal = 0;

    expenses.forEach((expense) => {
      const value = toNumber(expense.price);
      const categoryName = expense.category?.category ?? "";
      if (isIncomeCategory(categoryName)) {
        income += value;
      } else {
        expensesTotal += value;
      }
    });

    return {
      income,
      expensesTotal,
      net: income - expensesTotal,
      count: expenses.length,
    };
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    categories.forEach((category) => {
      totals.set(category.category, 0);
    });
    expenses.forEach((expense) => {
      const key = expense.category?.category || "Uncategorized";
      totals.set(key, (totals.get(key) ?? 0) + toNumber(expense.price));
    });

    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [categories, expenses]);

  const budgetByCategoryName = useMemo(() => {
    const map = new Map<string, number>();

    if (!filters.year) return map;

    categories.forEach((category) => {
      map.set(category.category, 0);
    });

    const selectedMonth = filters.month ? Number(filters.month) : null;
    budgets.forEach((entry) => {
      if (selectedMonth && entry.month !== selectedMonth) return;
      const name = entry.category?.category;
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + entry.budget);
    });

    return map;
  }, [budgets, categories, filters.month, filters.year]);
  const categoryByName = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => {
      map.set(category.category, category);
    });
    return map;
  }, [categories]);

  const emptyState = !loading && expenses.length === 0;
  const budgetSummary = useMemo(() => {
    if (!filters.year) {
      return { budgetTotal: 0, percentUsed: 0 };
    }

    const selectedMonth = filters.month ? Number(filters.month) : null;
    let budgetTotal = 0;

    budgets.forEach((entry) => {
      const name = entry.category?.category;
      if (!name || isIncomeCategory(name)) return;
      if (selectedMonth && entry.month !== selectedMonth) return;
      budgetTotal += entry.budget;
    });

    const percentUsed =
      budgetTotal > 0 ? (summary.expensesTotal / budgetTotal) * 100 : 0;

    return { budgetTotal, percentUsed };
  }, [budgets, filters.month, filters.year, summary.expensesTotal]);

  async function handleOpenBudgetEditor(categoryName: string) {
    if (!filters.year || !filters.month) {
      setBudgetStatus("Select a year and month to edit budgets.");
      return;
    }

    const category = categoryByName.get(categoryName);
    if (!category) return;

    setBudgetStatus(null);
    const monthValue = Number(filters.month);
    const yearValue = Number(filters.year);
    const existing = budgets.find(
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

    let previousBudget = budgets.find(
      (entry) =>
        entry.category_id === category.id &&
        entry.month === previous.month &&
        entry.year === previous.year
    );

    if (!previousBudget && previous.year !== yearValue) {
      const { data, error } = await supabase
        .from("budget")
        .select("budget")
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

  async function handleSaveBudget() {
    if (!editingCategory || !filters.year || !filters.month) return;

    const category = categoryByName.get(editingCategory);
    if (!category) return;

    const monthValue = Number(filters.month);
    const yearValue = Number(filters.year);
    const parsed = Number(budgetDraft);
    const budgetValue = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    const existing = budgets.find(
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
        .eq("id", existing.id);
      error = result.error;
    } else {
      const result = await supabase.from("budget").insert({
        category_id: category.id,
        budget: budgetValue,
        year: yearValue,
        month: monthValue,
        user_id: session.user.id,
      });
      error = result.error;
    }

    if (error) {
      setBudgetStatus(error.message);
    } else {
      await fetchBudgets(yearValue);
      setEditingCategory(null);
    }

    setBudgetSaving(false);
  }

  async function handleDelete(expense: Expense) {
    const confirmed = window.confirm(
      `Delete ${expense.item}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(expense.id);
    setStatus(null);

    const { error } = await supabase
      .from("expense")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", session.user.id);

    if (error) {
      setStatus(error.message);
    } else {
      setExpenses((prev) => prev.filter((entry) => entry.id !== expense.id));
    }

    setDeletingId(null);
  }

  function handlePrevPeriod() {
    if (!filters.year) return;

    if (filters.month) {
      const months = monthsForSelectedYear;
      if (!months.length) return;
      const currentIndex = months.indexOf(filters.month);
      if (currentIndex > 0) {
        setFilters((prev) => ({ ...prev, month: months[currentIndex - 1] }));
        return;
      }

      const yearIndex = yearOptions.indexOf(filters.year);
      if (yearIndex >= 0 && yearIndex < yearOptions.length - 1) {
        const previousYear = yearOptions[yearIndex + 1];
        const previousMonths = availableMonthsByYear[previousYear] ?? [];
        if (!previousMonths.length) {
          setFilters((prev) => ({ ...prev, year: previousYear, month: "" }));
          return;
        }
        setFilters((prev) => ({
          ...prev,
          year: previousYear,
          month: previousMonths[previousMonths.length - 1],
        }));
      }
      return;
    }

    const yearIndex = yearOptions.indexOf(filters.year);
    if (yearIndex >= 0 && yearIndex < yearOptions.length - 1) {
      const previousYear = yearOptions[yearIndex + 1];
      setFilters((prev) => ({ ...prev, year: previousYear }));
    }
  }

  function handleNextPeriod() {
    if (!filters.year) return;

    if (filters.month) {
      const months = monthsForSelectedYear;
      if (!months.length) return;
      const currentIndex = months.indexOf(filters.month);
      if (currentIndex >= 0 && currentIndex < months.length - 1) {
        setFilters((prev) => ({ ...prev, month: months[currentIndex + 1] }));
        return;
      }

      const yearIndex = yearOptions.indexOf(filters.year);
      if (yearIndex > 0) {
        const nextYear = yearOptions[yearIndex - 1];
        const nextMonths = availableMonthsByYear[nextYear] ?? [];
        if (!nextMonths.length) {
          setFilters((prev) => ({ ...prev, year: nextYear, month: "" }));
          return;
        }
        setFilters((prev) => ({
          ...prev,
          year: nextYear,
          month: nextMonths[0],
        }));
      }
      return;
    }

    const yearIndex = yearOptions.indexOf(filters.year);
    if (yearIndex > 0) {
      const nextYear = yearOptions[yearIndex - 1];
      setFilters((prev) => ({ ...prev, year: nextYear }));
    }
  }

  return (
    <main className="shell">
      <TopNav email={session.user.email} />
      <section className="grid">
        <div className="card stat">
          <span>Inntekter</span>
          <strong className="text-income">
            {formatCurrency(summary.income)}
          </strong>
        </div>
        <div className="card stat">
          <span>Utgifter</span>
          <strong>{formatCurrency(summary.expensesTotal)}</strong>
        </div>
        <div className="card stat">
          <span>Netto</span>
          <strong className={summary.net >= 0 ? "text-income" : "text-expense"}>
            {formatCurrency(summary.net)}
          </strong>
        </div>
        <div className="card stat">
          <span>Transaksjoner</span>
          <strong>{summary.count}</strong>
        </div>
      </section>

      <div style={{ marginTop: "24px" }}>
        <BudgetSummary
          spentTotal={summary.expensesTotal}
          budgetTotal={budgetSummary.budgetTotal}
          percentUsed={budgetSummary.percentUsed}
        />
      </div>

      <section className="grid" style={{ marginTop: "24px" }}>
        <div className={`card ${editingCategory ? "card-floating" : ""}`}>
          <h2 className="section-title">Filtere</h2>
          <div className="filter-nav">
            <div className="filter-nav-label">
              <span className="helper">Periode</span>
              <strong>{periodLabel}</strong>
            </div>
            <div className="filter-nav-actions">
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={handlePrevPeriod}
                disabled={!filters.year}
              >
                Forrige
              </button>
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={handleNextPeriod}
                disabled={!filters.year}
              >
                Neste
              </button>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="year">År</label>
              <select
                id="year"
                value={filters.year}
                onChange={(event) => {
                  const nextYear = event.target.value;
                  setFilters((prev) => {
                    if (!nextYear) {
                      return { ...prev, year: "", month: "" };
                    }

                    let nextMonth = prev.month;
                    const availableMonths = availableMonthsByYear[nextYear];
                    if (availableMonths?.length) {
                      if (!availableMonths.includes(nextMonth)) {
                        nextMonth = availableMonths.includes(currentMonth)
                          ? currentMonth
                          : availableMonths[0];
                      }
                    }

                    return { ...prev, year: nextYear, month: nextMonth };
                  });
                }}
              >
                <option value="">Alle år</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="month">Måned</label>
              <select
                id="month"
                value={filters.month}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, month: event.target.value }))
                }
                disabled={!filters.year}
              >
                <option value="">Alle måneder</option>
                {filterMonthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="card">
          <h2 className="section-title">Kategorier</h2>
          {budgetStatus ? <div className="status">{budgetStatus}</div> : null}
          {categoryTotals.length ? (
            <div className="bar-list">
              {categoryTotals.map((category) => {
                const isIncome = isIncomeCategory(category.name);
                const budgetValue =
                  budgetByCategoryName.get(category.name) ?? 0;
                const percentUsed =
                  budgetValue > 0 ? (category.total / budgetValue) * 100 : 0;
                const clampedPercent = Math.min(percentUsed, 200);
                const fillWidth = (clampedPercent / 200) * 100;
                const isOverBudget = budgetValue > 0 && percentUsed > 100;
                const isEditing = editingCategory === category.name;
                const canEditBudget = Boolean(filters.year && filters.month);
                return (
                  <div
                    key={category.name}
                    className={`bar-row ${isEditing ? "is-editing" : ""}`}
                  >
                    <div className="bar-header">
                      <strong className={isIncome ? "text-income" : ""}>
                        {category.name}
                      </strong>
                      <div className="bar-meta">
                        <span>
                          <span className="helper">
                            {formatCurrency(category.total)}
                          </span>
                          {filters.year && budgetValue > 0 ? (
                            <span className="helper">
                              {" / "}
                              {formatCurrency(budgetValue)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => handleOpenBudgetEditor(category.name)}
                        disabled={!canEditBudget}
                        title={
                          canEditBudget
                            ? "Edit budget"
                            : "Select a year and month"
                        }
                        aria-label={`Edit budget for ${category.name}`}
                      >
                        ✎
                      </button>
                    </div>
                    {isEditing ? (
                      <div className="budget-popover">
                        <div className="budget-popover-row">
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
                          <div className="budget-popover-row">
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
                        <div className="budget-popover-actions">
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
                    <div className="bar-track">
                      <div className="bar-marker" />
                      <div
                        className={`bar-fill ${isIncome ? "income" : ""} ${
                          isOverBudget ? "over" : ""
                        }`}
                        style={{
                          width: `${fillWidth}%`,
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
        </div>
      </section>

      <section className="card" style={{ marginTop: "24px" }}>
        <h2 className="section-title">Aktivitet</h2>
        {status ? <div className="status">{status}</div> : null}
        {loading ? <div className="helper">Laster transaksjoner...</div> : null}
        {emptyState ? (
          <div className="empty">
            Ingen transaksjoner matcher de nåværende filterene.
          </div>
        ) : (
          <div className="list">
            {expenses.map((expense, index) => {
              const categoryName =
                expense.category?.category || "Uncategorized";
              const isIncome = isIncomeCategory(categoryName);
              const amount = formatCurrency(toNumber(expense.price));
              const categoryStyle = {
                "--cat-hue": getCategoryHue(categoryName),
              } as CSSProperties;
              return (
                <div
                  key={expense.id}
                  className={`list-row ${isIncome ? "income-row" : ""}`}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <span>{formatDate(expense.date)}</span>
                  <span>{expense.tag ?? ""}</span>
                  <strong>{expense.item}</strong>
                  <strong className={isIncome ? "text-income" : ""}>
                    {isIncome ? `+${amount}` : `-${amount}`}
                  </strong>
                  <span className="category-pill" style={categoryStyle}>
                    {categoryName}
                  </span>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => handleDelete(expense)}
                    disabled={deletingId === expense.id}
                    aria-label={`Delete ${expense.item}`}
                    title="Delete"
                  >
                    X
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function VisualizePage() {
  return (
    <AuthGate>{(session) => <VisualizeContent session={session} />}</AuthGate>
  );
}
