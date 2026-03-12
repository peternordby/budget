"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, formatDate, toNumber } from "@/lib/format";

type Filters = {
  year: string;
  month: string;
};

type ActivityFilters = {
  itemQuery: string;
  tag: string;
  category: string;
};

type ActivitySortKey = "date" | "tag" | "item" | "amount" | "category";

type ActivitySortDirection = "asc" | "desc";

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

function IconPencil() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const incomeCategoryLabel = "inntekter";

function isIncomeCategory(name: string) {
  return name.trim().toLowerCase() === incomeCategoryLabel;
}

function getCategoryHue(name: string) {
  const normalized = name.trim().toLowerCase() || "ukategorisert";
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

function compareTextValues(a: string, b: string) {
  return a.localeCompare(b, "nb", { sensitivity: "base" });
}

function getExpenseCategoryLabel(expense: Expense) {
  return expense.category?.category || "Ukategorisert";
}

function getSignedAmount(expense: Expense) {
  const value = toNumber(expense.price);
  return isIncomeCategory(getExpenseCategoryLabel(expense)) ? value : -value;
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
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({
    item: "",
    price: "",
    categoryId: "",
    tag: "",
    date: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [newRowDraft, setNewRowDraft] = useState({
    item: "",
    price: "",
    categoryId: "",
    tag: "",
    date: "",
  });
  const [newRowSaving, setNewRowSaving] = useState(false);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>({
    itemQuery: "",
    tag: "",
    category: "",
  });
  const [activitySort, setActivitySort] = useState<{
    key: ActivitySortKey;
    direction: ActivitySortDirection;
  }>({
    key: "date",
    direction: "desc",
  });
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
      // Supabase may return `category` as an array; normalize to a single object or null.
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
        // Normalize rows: Supabase may return `category` as an array.
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
      const key = expense.category?.category || "Ukategorisert";
      totals.set(key, (totals.get(key) ?? 0) + toNumber(expense.price));
    });

    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => {
        const aIncome = isIncomeCategory(a.name);
        const bIncome = isIncomeCategory(b.name);
        if (aIncome !== bIncome) {
          return aIncome ? -1 : 1;
        }
        return b.total - a.total;
      });
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
  const maxCategoryAmount = useMemo(() => {
    let maxValue = 0;

    categoryTotals.forEach((category) => {
      maxValue = Math.max(maxValue, category.total);
      if (filters.year) {
        maxValue = Math.max(
          maxValue,
          budgetByCategoryName.get(category.name) ?? 0
        );
      }
    });

    return Math.max(maxValue, 1);
  }, [budgetByCategoryName, categoryTotals, filters.year]);
  const activityTagOptions = useMemo(() => {
    const tags = new Set<string>();
    expenses.forEach((expense) => {
      const value = expense.tag?.trim();
      if (value) tags.add(value);
    });
    return Array.from(tags).sort(compareTextValues);
  }, [expenses]);
  const activityCategoryOptions = useMemo(() => {
    const categoryNames = new Set<string>();
    expenses.forEach((expense) => {
      categoryNames.add(getExpenseCategoryLabel(expense));
    });
    return Array.from(categoryNames).sort((a, b) => {
      const aIncome = isIncomeCategory(a);
      const bIncome = isIncomeCategory(b);
      if (aIncome !== bIncome) {
        return aIncome ? -1 : 1;
      }
      return compareTextValues(a, b);
    });
  }, [expenses]);
  const filteredAndSortedExpenses = useMemo(() => {
    const filtered = expenses.filter((expense) => {
      const categoryName = getExpenseCategoryLabel(expense);
      const tagValue = expense.tag?.trim() ?? "";
      const itemValue = expense.item.trim().toLowerCase();
      const itemQuery = activityFilters.itemQuery.trim().toLowerCase();

      if (activityFilters.tag && tagValue !== activityFilters.tag) {
        return false;
      }
      if (activityFilters.category && categoryName !== activityFilters.category) {
        return false;
      }
      if (itemQuery && !itemValue.includes(itemQuery)) {
        return false;
      }

      return true;
    });

    const direction = activitySort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (activitySort.key) {
        case "date": {
          const aDate = a.date ? new Date(a.date).getTime() : 0;
          const bDate = b.date ? new Date(b.date).getTime() : 0;
          return (aDate - bDate) * direction;
        }
        case "tag":
          return compareTextValues(a.tag ?? "", b.tag ?? "") * direction;
        case "item":
          return compareTextValues(a.item, b.item) * direction;
        case "amount":
          return (getSignedAmount(a) - getSignedAmount(b)) * direction;
        case "category":
          return (
            compareTextValues(
              getExpenseCategoryLabel(a),
              getExpenseCategoryLabel(b)
            ) * direction
          );
        default:
          return 0;
      }
    });
  }, [activityFilters, activitySort, expenses]);
  const activityTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let net = 0;

    filteredAndSortedExpenses.forEach((entry) => {
      const signedAmount = getSignedAmount(entry);
      net += signedAmount;
      if (signedAmount >= 0) {
        income += signedAmount;
      } else {
        expense += Math.abs(signedAmount);
      }
    });

    return {
      income,
      expense,
      net,
      count: filteredAndSortedExpenses.length,
    };
  }, [filteredAndSortedExpenses]);
  const hasActivityFilters = Boolean(
    activityFilters.itemQuery || activityFilters.tag || activityFilters.category
  );
  const activityTotalLabel = activityFilters.tag
    ? `Total for merkelapp «${activityFilters.tag}»`
    : "Total for filtrert utvalg";
  const activitySortLabel = useMemo(() => {
    const labelByKey: Record<ActivitySortKey, string> = {
      date: "dato",
      tag: "merkelapp",
      item: "beskrivelse",
      amount: "beløp",
      category: "kategori",
    };
    const directionLabel =
      activitySort.direction === "asc" ? "stigende" : "synkende";
    return `${labelByKey[activitySort.key]} (${directionLabel})`;
  }, [activitySort.direction, activitySort.key]);

  useEffect(() => {
    if (!activityFilters.tag) return;
    if (activityTagOptions.includes(activityFilters.tag)) return;
    setActivityFilters((prev) => ({ ...prev, tag: "" }));
  }, [activityFilters.tag, activityTagOptions]);

  useEffect(() => {
    if (!activityFilters.category) return;
    if (activityCategoryOptions.includes(activityFilters.category)) return;
    setActivityFilters((prev) => ({ ...prev, category: "" }));
  }, [activityCategoryOptions, activityFilters.category]);

  const emptyState = !loading && expenses.length === 0;
  const budgetSummary = useMemo(() => {
    if (!filters.year) {
      return { budgetTotal: 0, percentUsed: 0, remaining: 0, daysLeft: 0, dailyBudget: 0 };
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
    const remaining = budgetTotal - summary.expensesTotal;

    let daysLeft = 0;
    let dailyBudget = 0;
    if (filters.month) {
      const y = Number(filters.year);
      const m = Number(filters.month);
      const totalDays = new Date(y, m, 0).getDate();
      const now = new Date();
      if (y === now.getFullYear() && m === now.getMonth() + 1) {
        daysLeft = Math.max(totalDays - now.getDate(), 0);
      } else if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) {
        daysLeft = totalDays;
      }
      dailyBudget = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
    }

    return { budgetTotal, percentUsed, remaining, daysLeft, dailyBudget };
  }, [budgets, filters.month, filters.year, summary.expensesTotal]);

  const budgetInsights = useMemo(() => {
    if (!filters.year || !filters.month) return null;

    const categoriesWithBudget: { name: string; spent: number; budget: number; percent: number }[] = [];

    categoryTotals.forEach((cat) => {
      if (isIncomeCategory(cat.name)) return;
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
  }, [budgetByCategoryName, categoryTotals, filters.month, filters.year]);

  const expenseBreakdown = useMemo(() => {
    const items: { name: string; total: number; hue: number }[] = [];
    let expenseSum = 0;
    categoryTotals.forEach((cat) => {
      if (isIncomeCategory(cat.name) || cat.total <= 0) return;
      items.push({ name: cat.name, total: cat.total, hue: getCategoryHue(cat.name) });
      expenseSum += cat.total;
    });
    return { items, total: expenseSum };
  }, [categoryTotals]);

  async function handleOpenBudgetEditor(categoryName: string) {
    if (!filters.year || !filters.month) {
      setBudgetStatus("Velg år og måned for å redigere budsjett.");
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
      `Slette ${expense.item}? Dette kan ikke angres.`
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

  function handleActivitySort(nextKey: ActivitySortKey) {
    setActivitySort((prev) => {
      if (prev.key === nextKey) {
        return {
          ...prev,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      const defaultDirection =
        nextKey === "date" || nextKey === "amount" ? "desc" : "asc";
      return {
        key: nextKey,
        direction: defaultDirection,
      };
    });
  }

  function clearActivityFilters() {
    setActivityFilters({
      itemQuery: "",
      tag: "",
      category: "",
    });
  }

  function handleStartEdit(expense: Expense) {
    setEditingExpenseId(expense.id);
    setEditDraft({
      item: expense.item,
      price: String(toNumber(expense.price)),
      categoryId: String(expense.category_id),
      tag: expense.tag ?? "",
      date: expense.date ?? "",
    });
  }

  function handleCancelEdit() {
    setEditingExpenseId(null);
    setEditDraft({ item: "", price: "", categoryId: "", tag: "", date: "" });
  }

  async function handleSaveEdit() {
    if (!editingExpenseId) return;
    const parsed = Number(editDraft.price);
    if (!editDraft.item.trim() || !editDraft.categoryId || !Number.isFinite(parsed)) return;

    setEditSaving(true);
    setStatus(null);

    const { error } = await supabase
      .from("expense")
      .update({
        item: editDraft.item.trim(),
        price: Math.round(parsed),
        category_id: Number(editDraft.categoryId),
        tag: editDraft.tag.trim() || null,
        date: editDraft.date || null,
      })
      .eq("id", editingExpenseId)
      .eq("user_id", session.user.id);

    if (error) {
      setStatus(error.message);
    } else {
      const updatedCategory = categories.find(
        (c) => c.id === Number(editDraft.categoryId)
      ) ?? null;
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === editingExpenseId
            ? {
                ...e,
                item: editDraft.item.trim(),
                price: Math.round(parsed),
                category_id: Number(editDraft.categoryId),
                tag: editDraft.tag.trim() || null,
                date: editDraft.date || null,
                category: updatedCategory,
              }
            : e
        )
      );
      handleCancelEdit();
    }

    setEditSaving(false);
  }

  function getDefaultNewRowDate() {
    if (filters.year && filters.month) {
      const y = Number(filters.year);
      const m = Number(filters.month);
      const now = new Date();
      if (y === now.getFullYear() && m === now.getMonth() + 1) {
        return formatDateParts(y, m, now.getDate());
      }
      return formatDateParts(y, m, 1);
    }
    const now = new Date();
    return formatDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  async function handleSaveNewRow() {
    const parsed = Number(newRowDraft.price);
    if (!newRowDraft.item.trim() || !newRowDraft.categoryId || !Number.isFinite(parsed) || parsed === 0) return;

    setNewRowSaving(true);
    setStatus(null);

    const payload = {
      item: newRowDraft.item.trim(),
      price: Math.round(Math.abs(parsed)),
      category_id: Number(newRowDraft.categoryId),
      tag: newRowDraft.tag.trim() || null,
      user_id: session.user.id,
      date: newRowDraft.date || null,
    };

    const { data, error } = await supabase
      .from("expense")
      .insert(payload)
      .select("id, item, price, category_id, tag, user_id, date, category(id, category)");

    if (error) {
      setStatus(error.message);
    } else if (data?.length) {
      const entry = data[0] as any;
      const category = Array.isArray(entry.category)
        ? entry.category[0] ?? null
        : entry.category ?? null;
      const newExpense = { ...entry, category } as Expense;
      setExpenses((prev) => [newExpense, ...prev]);
      setNewRowDraft({
        item: "",
        price: "",
        categoryId: newRowDraft.categoryId,
        tag: newRowDraft.tag,
        date: newRowDraft.date,
      });
    }

    setNewRowSaving(false);
  }

  function handleSpreadsheetKeyDown(
    event: React.KeyboardEvent,
    onSave: () => void,
    onCancel: () => void
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  function getSortIndicator(key: ActivitySortKey) {
    if (activitySort.key !== key) return "";
    return activitySort.direction === "asc" ? <IconChevronUp /> : <IconChevronDown />;
  }

  return (
    <main className="shell">
      <TopNav email={session.user.email} />
      <section className="card mobile-new-row-card"
        onKeyDown={(e) =>
          handleSpreadsheetKeyDown(e, handleSaveNewRow, () =>
            setNewRowDraft({ item: "", price: "", categoryId: "", tag: "", date: "" })
          )
        }
      >
        <h2 className="section-title">Ny transaksjon</h2>
        <div className="mobile-new-row-grid">
          <div className="field">
            <label>Beskrivelse</label>
            <input
              type="text"
              value={newRowDraft.item}
              onChange={(e) =>
                setNewRowDraft((prev) => ({ ...prev, item: e.target.value }))
              }
              placeholder="Hva brukte du penger på?"
            />
          </div>
          <div className="field">
            <label>Beløp</label>
            <input
              type="number"
              value={newRowDraft.price}
              onChange={(e) =>
                setNewRowDraft((prev) => ({ ...prev, price: e.target.value }))
              }
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>Kategori</label>
            <select
              value={newRowDraft.categoryId}
              onChange={(e) =>
                setNewRowDraft((prev) => ({ ...prev, categoryId: e.target.value }))
              }
            >
              <option value="">Velg kategori...</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Dato</label>
            <input
              type="date"
              value={newRowDraft.date || getDefaultNewRowDate()}
              onChange={(e) =>
                setNewRowDraft((prev) => ({ ...prev, date: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Merkelapp</label>
            <input
              type="text"
              value={newRowDraft.tag}
              onChange={(e) =>
                setNewRowDraft((prev) => ({ ...prev, tag: e.target.value }))
              }
              placeholder="Valgfritt"
            />
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            type="button"
            onClick={handleSaveNewRow}
            disabled={newRowSaving || !newRowDraft.item.trim() || !newRowDraft.categoryId || !newRowDraft.price}
          >
            {newRowSaving ? "Lagrer..." : "Legg til"}
          </button>
        </div>
      </section>
      <section className="grid metrics-grid">
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

      {budgetSummary.budgetTotal > 0 ? (
        <section className="card section-gap gauge-card" style={{
          "--gauge-pct": Math.min(budgetSummary.percentUsed, 100),
          "--gauge-color": budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "#c87f31" : "var(--income)",
        } as CSSProperties}>
          <div className="gauge-layout">
            <div className="gauge-ring-wrap">
              <div className="gauge-ring" />
              <div className="gauge-center">
                <span className="gauge-pct" style={{
                  color: budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "#a06828" : "var(--income)",
                }}>
                  {budgetSummary.percentUsed.toFixed(0)}%
                </span>
                <span className="gauge-label">brukt</span>
              </div>
            </div>
            <div className="gauge-details">
              <div className="gauge-main-figure">
                <span className="helper">Brukt av budsjett</span>
                <strong>{formatCurrency(summary.expensesTotal)} <span className="helper" style={{ fontWeight: 400, fontSize: "16px" }}>/ {formatCurrency(budgetSummary.budgetTotal)}</span></strong>
              </div>
              <div className="gauge-stats">
                <div className={`gauge-stat ${budgetSummary.remaining >= 0 ? "" : "gauge-stat-danger"}`}>
                  <span className="gauge-stat-value">{budgetSummary.remaining >= 0 ? formatCurrency(budgetSummary.remaining) : `-${formatCurrency(Math.abs(budgetSummary.remaining))}`}</span>
                  <span className="gauge-stat-label">{budgetSummary.remaining >= 0 ? "Gjenstår" : "Over budsjett"}</span>
                </div>
                {budgetSummary.daysLeft > 0 && budgetSummary.remaining > 0 ? (
                  <div className="gauge-stat">
                    <span className="gauge-stat-value">{formatCurrency(Math.round(budgetSummary.dailyBudget))}</span>
                    <span className="gauge-stat-label">Per dag ({budgetSummary.daysLeft} dager igjen)</span>
                  </div>
                ) : null}
              </div>
              {budgetInsights ? (
                <div className="gauge-insights">
                  {budgetInsights.overCount === 0 ? (
                    <span className="insight-chip insight-good">Alle {budgetInsights.total} kategorier er under budsjett</span>
                  ) : (
                    <span className="insight-chip insight-warn">{budgetInsights.overCount} av {budgetInsights.total} kategorier er over budsjett</span>
                  )}
                  {budgetInsights.worst && budgetInsights.worst.percent > 100 ? (
                    <span className="insight-chip insight-bad">{budgetInsights.worst.name}: {budgetInsights.worst.percent.toFixed(0)}% brukt</span>
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
          <div className="breakdown-bar">
            {expenseBreakdown.items.map((item) => {
              const pct = (item.total / expenseBreakdown.total) * 100;
              return (
                <div
                  key={item.name}
                  className="breakdown-segment"
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    background: `hsl(${item.hue} 52% 56%)`,
                  } as CSSProperties}
                  title={`${item.name}: ${formatCurrency(item.total)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className="breakdown-legend">
            {expenseBreakdown.items.map((item) => {
              const pct = (item.total / expenseBreakdown.total) * 100;
              return (
                <div key={item.name} className="breakdown-legend-item">
                  <span className="breakdown-dot" style={{ background: `hsl(${item.hue} 52% 56%)` }} />
                  <span className="breakdown-legend-name">{item.name}</span>
                  <span className="breakdown-legend-value">{formatCurrency(item.total)}</span>
                  <span className="breakdown-legend-pct">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="grid section-gap">
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
            <div className="category-chart-list">
              {categoryTotals.map((category) => {
                const isIncome = isIncomeCategory(category.name);
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
                const canEditBudget = Boolean(filters.year && filters.month);
                const catHue = getCategoryHue(category.name);
                return (
                  <div
                    key={category.name}
                    className={`category-chart-row ${
                      isEditing ? "is-editing" : ""
                    } ${categoryBudgetStateClass}`}
                  >
                    <div className="category-chart-header">
                      <div className="cat-name-row">
                        <span className="cat-dot" style={{
                          background: isIncome
                            ? "var(--income)"
                            : `hsl(${catHue} 48% 50%)`,
                        }} />
                        <strong className={isIncome ? "text-income" : ""}>
                          {category.name}
                        </strong>
                      </div>
                      <div className="category-chart-values">
                        <span className="category-value">
                          {formatCurrency(category.total)}
                        </span>
                        {filters.year && hasBudget && !isIncome ? (
                          <>
                            <span className="category-value helper">
                              / {formatCurrency(budgetValue)}
                            </span>
                            <span className={`cat-remaining ${isOverBudget ? "text-expense" : "text-income"}`}>
                              {isOverBudget
                                ? `${formatCurrency(Math.abs(remaining))} over`
                                : `${formatCurrency(remaining)} igjen`}
                            </span>
                          </>
                        ) : filters.year && !isIncome ? (
                          <span className="category-value helper">Budsjett ikke satt</span>
                        ) : null}
                      </div>
                      {hasBudget && !isIncome ? (
                        <span className={`cat-pct-badge ${isOverBudget ? "cat-pct-over" : percentUsed > 75 ? "cat-pct-warn" : "cat-pct-ok"}`}>
                          {percentUsed.toFixed(0)}%
                        </span>
                      ) : null}
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => handleOpenBudgetEditor(category.name)}
                        disabled={!canEditBudget}
                        title={
                          canEditBudget ? "Rediger budsjett" : "Velg år og måned"
                        }
                        aria-label={`Rediger budsjett for ${category.name}`}
                      >
                        <IconPencil />
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
                    <div className="category-chart-track" style={{
                      "--bar-color": isIncome
                        ? "var(--income)"
                        : hasBudget
                          ? isOverBudget
                            ? "var(--expense)"
                            : "var(--income)"
                          : `hsl(${catHue} 42% 52%)`,
                    } as CSSProperties}>
                      {hasBudget && !isIncome ? (
                        <div className="category-chart-budget-mark" style={{
                          left: `${Math.min((budgetValue / barScale) * 100, 100)}%`,
                        }} />
                      ) : null}
                      <div
                        className={`category-chart-bar spent ${spentBarStateClass}`}
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
        </div>
      </section>

      <section className="card section-gap">
        <div className="activity-head">
          <h2 className="section-title">Aktivitet</h2>
          <span className="helper">Sortert på {activitySortLabel}</span>
        </div>
        {status ? <div className="status">{status}</div> : null}
        <div className="activity-controls">
          <div className="field">
            <label htmlFor="activity-item-query">Beskrivelse</label>
            <input
              id="activity-item-query"
              value={activityFilters.itemQuery}
              onChange={(event) =>
                setActivityFilters((prev) => ({
                  ...prev,
                  itemQuery: event.target.value,
                }))
              }
              placeholder="Søk i beskrivelse"
            />
          </div>
          <div className="field">
            <label htmlFor="activity-tag-filter">Merkelapp</label>
            <select
              id="activity-tag-filter"
              value={activityFilters.tag}
              onChange={(event) =>
                setActivityFilters((prev) => ({
                  ...prev,
                  tag: event.target.value,
                }))
              }
            >
              <option value="">Alle merkelapper</option>
              {activityTagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="activity-category-filter">Kategori</label>
            <select
              id="activity-category-filter"
              value={activityFilters.category}
              onChange={(event) =>
                setActivityFilters((prev) => ({
                  ...prev,
                  category: event.target.value,
                }))
              }
            >
              <option value="">Alle kategorier</option>
              {activityCategoryOptions.map((categoryName) => (
                <option key={categoryName} value={categoryName}>
                  {categoryName}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-ghost btn-small activity-clear"
            type="button"
            onClick={clearActivityFilters}
            disabled={!hasActivityFilters}
          >
            Nullstill filtre
          </button>
        </div>
        <div className="activity-total-row">
          <div className="activity-total">
            <span className="helper">{activityTotalLabel}</span>
            <strong
              className={activityTotals.net >= 0 ? "text-income" : "text-expense"}
            >
              {activityTotals.net >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(activityTotals.net))}
            </strong>
          </div>
          <div className="activity-total-meta helper">
            Inntekter {formatCurrency(activityTotals.income)} | Utgifter{" "}
            {formatCurrency(activityTotals.expense)} | {activityTotals.count}{" "}
            transaksjoner
          </div>
        </div>
        {loading ? <div className="helper">Laster transaksjoner...</div> : null}
        {!loading ? (
          <div className="list">
            <div className="list-header" role="row">
              <button
                className={`list-sort ${
                  activitySort.key === "date" ? "active" : ""
                }`}
                type="button"
                onClick={() => handleActivitySort("date")}
              >
                Dato
                <span className="list-sort-indicator">
                  {getSortIndicator("date")}
                </span>
              </button>
              <button
                className={`list-sort ${
                  activitySort.key === "tag" ? "active" : ""
                }`}
                type="button"
                onClick={() => handleActivitySort("tag")}
              >
                Merkelapp
                <span className="list-sort-indicator">
                  {getSortIndicator("tag")}
                </span>
              </button>
              <button
                className={`list-sort ${
                  activitySort.key === "item" ? "active" : ""
                }`}
                type="button"
                onClick={() => handleActivitySort("item")}
              >
                Beskrivelse
                <span className="list-sort-indicator">
                  {getSortIndicator("item")}
                </span>
              </button>
              <button
                className={`list-sort ${
                  activitySort.key === "amount" ? "active" : ""
                }`}
                type="button"
                onClick={() => handleActivitySort("amount")}
              >
                Beløp
                <span className="list-sort-indicator">
                  {getSortIndicator("amount")}
                </span>
              </button>
              <button
                className={`list-sort ${
                  activitySort.key === "category" ? "active" : ""
                }`}
                type="button"
                onClick={() => handleActivitySort("category")}
              >
                Kategori
                <span className="list-sort-indicator">
                  {getSortIndicator("category")}
                </span>
              </button>
              <span className="list-sort empty" aria-hidden="true" />
            </div>
            <div
              className="list-row new-row"
              onKeyDown={(e) =>
                handleSpreadsheetKeyDown(e, handleSaveNewRow, () =>
                  setNewRowDraft({ item: "", price: "", categoryId: "", tag: "", date: "" })
                )
              }
            >
              <input
                className="cell-input"
                type="date"
                value={newRowDraft.date || getDefaultNewRowDate()}
                onChange={(e) =>
                  setNewRowDraft((prev) => ({ ...prev, date: e.target.value }))
                }
                aria-label="Dato"
              />
              <input
                className="cell-input"
                type="text"
                value={newRowDraft.tag}
                onChange={(e) =>
                  setNewRowDraft((prev) => ({ ...prev, tag: e.target.value }))
                }
                placeholder="Merkelapp"
                aria-label="Merkelapp"
              />
              <input
                className="cell-input"
                type="text"
                value={newRowDraft.item}
                onChange={(e) =>
                  setNewRowDraft((prev) => ({ ...prev, item: e.target.value }))
                }
                placeholder="Beskrivelse"
                aria-label="Beskrivelse"
              />
              <input
                className="cell-input cell-input-number"
                type="number"
                value={newRowDraft.price}
                onChange={(e) =>
                  setNewRowDraft((prev) => ({ ...prev, price: e.target.value }))
                }
                placeholder="Beløp"
                aria-label="Beløp"
              />
              <select
                className="cell-input"
                value={newRowDraft.categoryId}
                onChange={(e) =>
                  setNewRowDraft((prev) => ({ ...prev, categoryId: e.target.value }))
                }
                aria-label="Kategori"
              >
                <option value="">Kategori...</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.category}
                  </option>
                ))}
              </select>
              <button
                className="save-button"
                type="button"
                onClick={handleSaveNewRow}
                disabled={newRowSaving || !newRowDraft.item.trim() || !newRowDraft.categoryId || !newRowDraft.price}
                aria-label="Lagre ny rad"
                title="Lagre (Enter)"
              >
                {newRowSaving ? "..." : <IconPlus />}
              </button>
            </div>
            {!emptyState && filteredAndSortedExpenses.length === 0 ? (
              <div className="empty">
                Ingen transaksjoner matcher filtrene i aktivitetstabellen.
              </div>
            ) : null}
            {filteredAndSortedExpenses.map((expense) => {
              const categoryName = getExpenseCategoryLabel(expense);
              const signedAmount = getSignedAmount(expense);
              const isIncome = signedAmount >= 0;
              const amount = formatCurrency(Math.abs(signedAmount));
              const categoryStyle = {
                "--cat-hue": getCategoryHue(categoryName),
              } as CSSProperties;
              const isEditing = editingExpenseId === expense.id;

              if (isEditing) {
                return (
                  <div
                    key={expense.id}
                    className="list-row editing-row"
                    onKeyDown={(e) =>
                      handleSpreadsheetKeyDown(e, handleSaveEdit, handleCancelEdit)
                    }
                  >
                    <input
                      className="cell-input"
                      type="date"
                      value={editDraft.date}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev, date: e.target.value }))
                      }
                      aria-label="Dato"
                    />
                    <input
                      className="cell-input"
                      type="text"
                      value={editDraft.tag}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev, tag: e.target.value }))
                      }
                      placeholder="Merkelapp"
                      aria-label="Merkelapp"
                    />
                    <input
                      className="cell-input"
                      type="text"
                      value={editDraft.item}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev, item: e.target.value }))
                      }
                      placeholder="Beskrivelse"
                      aria-label="Beskrivelse"
                      autoFocus
                    />
                    <input
                      className="cell-input cell-input-number"
                      type="number"
                      value={editDraft.price}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev, price: e.target.value }))
                      }
                      placeholder="Beløp"
                      aria-label="Beløp"
                    />
                    <select
                      className="cell-input"
                      value={editDraft.categoryId}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev, categoryId: e.target.value }))
                      }
                      aria-label="Kategori"
                    >
                      <option value="">Kategori...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.category}
                        </option>
                      ))}
                    </select>
                    <div className="row-actions">
                      <button
                        className="save-button"
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        aria-label="Lagre"
                        title="Lagre (Enter)"
                      >
                        {editSaving ? "..." : <IconCheck />}
                      </button>
                      <button
                        className="cancel-button"
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={editSaving}
                        aria-label="Avbryt"
                        title="Avbryt (Esc)"
                      >
                        <IconX />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={expense.id}
                  className={`list-row ${isIncome ? "income-row" : ""}`}
                  onDoubleClick={() => handleStartEdit(expense)}
                  title="Dobbeltklikk for å redigere"
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
                    aria-label={`Slett ${expense.item}`}
                    title="Slett"
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function VisualizePage() {
  return (
    <AuthGate>{(session) => <VisualizeContent session={session} />}</AuthGate>
  );
}
