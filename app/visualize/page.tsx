"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import MonthOverMonth from "@/components/MonthOverMonth";
import Anomalies from "@/components/Anomalies";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, formatDate, toNumber } from "@/lib/format";
import {
  addMonths,
  listWindowMonths,
  monthKey,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";

type ActivityFilters = {
  itemQuery: string;
  tag: string;
  category: string;
};

type ActivitySortKey = "date" | "tag" | "item" | "amount" | "category";

type ActivitySortDirection = "asc" | "desc";

type ColumnKey = ActivitySortKey;

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "date",
  "tag",
  "item",
  "amount",
  "category",
];

const COLUMN_STORAGE_KEY = "budget.column-order.v1";

const COLUMN_TRACKS: Record<ColumnKey, string> = {
  date: "minmax(88px, 0.82fr)",
  tag: "minmax(72px, 0.68fr)",
  item: "minmax(140px, 1.55fr)",
  amount: "minmax(96px, 0.95fr)",
  category: "minmax(106px, 1fr)",
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  date: "Dato",
  tag: "Merkelapp",
  item: "Beskrivelse",
  amount: "Beløp",
  category: "Kategori",
};

function isValidColumnOrder(value: unknown): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_COLUMN_ORDER.length &&
    DEFAULT_COLUMN_ORDER.every((key) => value.includes(key))
  );
}

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
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
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
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(
    DEFAULT_COLUMN_ORDER
  );
  const [dragColumn, setDragColumn] = useState<ColumnKey | null>(null);
  const [dropTarget, setDropTarget] = useState<ColumnKey | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LedgerEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
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
  const todayRef = useMemo<MonthRef>(
    () => ({ year: today.getFullYear(), month: today.getMonth() + 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // The set of selected month keys ("YYYY-MM") that scopes every figure on the
  // page, the trailing window the chart shows, and whether plain clicks toggle.
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(
    () => new Set([monthKey(todayRef.year, todayRef.month)])
  );
  const [windowEnd, setWindowEnd] = useState<MonthRef>(todayRef);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectionReady, setSelectionReady] = useState(false);
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
  // Stable string signal for the selection so effects/memos can depend on the
  // contents of the Set rather than its identity.
  const selectedKey = useMemo(
    () => Array.from(selectedMonths).sort().join(","),
    [selectedMonths]
  );
  const selectedList = useMemo<MonthRef[]>(() => {
    return Array.from(selectedMonths)
      .map((key) => {
        const [year, month] = key.split("-");
        return { year: Number(year), month: Number(month) };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);
  const singleMonth = selectedList.length === 1 ? selectedList[0] : null;
  const hasPeriod = selectedList.length > 0;
  const selectedYears = useMemo(
    () => Array.from(new Set(selectedList.map((ref) => ref.year))),
    [selectedList]
  );
  const selectedYearsKey = selectedYears.join(",");
  const yearButtons = useMemo(() => {
    const set = new Set(availableYears.map(Number));
    set.add(todayRef.year);
    // Offer next year too so budgets can be planned ahead.
    set.add(todayRef.year + 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [availableYears, todayRef.year]);
  const selectedMonthLabel = useMemo(() => {
    if (!singleMonth) return "";
    return (
      allMonthOptions.find((month) => Number(month.value) === singleMonth.month)
        ?.label ?? ""
    );
  }, [allMonthOptions, singleMonth]);
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

  // Once we know which months actually have data, default the selection to the
  // current month when it has data, otherwise the most recent month that does.
  // Runs once; after that the user owns the selection.
  useEffect(() => {
    if (selectionReady) return;
    if (!availableYears.length) return;

    const currentMonthsForYear = availableMonthsByYear[currentYear] ?? [];
    let target = todayRef;
    if (!currentMonthsForYear.includes(currentMonth)) {
      const latestYear = availableYears[0];
      const months = availableMonthsByYear[latestYear] ?? [];
      if (months.length) {
        target = {
          year: Number(latestYear),
          month: Number(months[months.length - 1]),
        };
      }
    }

    setSelectedMonths(new Set([monthKey(target.year, target.month)]));
    setWindowEnd(target);
    setSelectionReady(true);
  }, [
    availableMonthsByYear,
    availableYears,
    currentMonth,
    currentYear,
    selectionReady,
    todayRef,
  ]);

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

  async function fetchBudgets(years: number[]) {
    setBudgetStatus(null);

    if (!years.length) {
      setBudgets([]);
      return;
    }

    const { data, error } = await supabase
      .from("budget")
      .select("id, category_id, budget, year, month, category(id, category)")
      .eq("user_id", session.user.id)
      .in("year", years)
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
    fetchBudgets(selectedYears);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearsKey]);

  useEffect(() => {
    let active = true;

    async function loadExpenses() {
      setLoading(true);
      setStatus(null);

      if (!selectedList.length) {
        setExpenses([]);
        setLoading(false);
        return;
      }

      // Selected months may be non-contiguous; fetch the spanning range, then
      // keep only rows whose month is in the selection.
      const first = selectedList[0];
      const last = selectedList[selectedList.length - 1];
      const lastDay = new Date(last.year, last.month, 0).getDate();
      const start = formatDateParts(first.year, first.month, 1);
      const end = formatDateParts(last.year, last.month, lastDay);

      const { data, error } = await supabase
        .from("expense")
        .select(
          "id, item, price, category_id, tag, user_id, date, category(id, category)"
        )
        .eq("user_id", session.user.id)
        .gte("date", start)
        .lte("date", end)
        .order("id", { ascending: false });

      if (!active) return;

      if (error) {
        setStatus(error.message);
        setExpenses([]);
      } else {
        // Normalize rows: Supabase may return `category` as an array.
        const normalized = (data ?? [])
          .map((entry: any) => {
            const category = Array.isArray(entry.category)
              ? entry.category[0] ?? null
              : entry.category ?? null;
            return { ...entry, category } as Expense;
          })
          .filter(
            (entry) =>
              Boolean(entry.date) &&
              selectedMonths.has((entry.date as string).slice(0, 7))
          );
        setExpenses(normalized);
      }

      setLoading(false);
    }

    loadExpenses();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id, selectedKey]);

  // The chart's trailing 12-month window, driven by the window navigation
  // rather than the selection so you can scroll through history freely.
  const anchor = windowEnd;

  const selectedMonthRef = singleMonth;

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      const windowMonths = listWindowMonths(anchor, 12);
      const first = windowMonths[0];
      const start = formatDateParts(first.year, first.month, 1);
      const lastDay = new Date(anchor.year, anchor.month, 0).getDate();
      const end = formatDateParts(anchor.year, anchor.month, lastDay);

      const { data, error } = await supabase
        .from("expense")
        .select("id, item, price, tag, date, category(id, category)")
        .eq("user_id", session.user.id)
        .gte("date", start)
        .lte("date", end);

      if (!active) return;

      if (error) {
        setHistoryEntries([]);
        return;
      }

      const normalized: LedgerEntry[] = (data ?? [])
        .filter((entry: any) => Boolean(entry.date))
        .map((entry: any) => {
          const category = Array.isArray(entry.category)
            ? entry.category[0] ?? null
            : entry.category ?? null;
          const name = category?.category || "Ukategorisert";
          return {
            id: entry.id,
            item: entry.item,
            amount: toNumber(entry.price),
            category: name,
            isIncome: isIncomeCategory(name),
            date: entry.date as string,
            tag: entry.tag ?? null,
          };
        });
      setHistoryEntries(normalized);
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [session.user.id, anchor.year, anchor.month, historyVersion]);

  // Hydrate the per-device column order preference after mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isValidColumnOrder(parsed)) {
        setColumnOrder(parsed);
      }
    } catch {
      // Ignore unreadable preferences and keep the default order.
    }
  }, []);

  // Keep the new-row date in sync with the viewed period so the value shown
  // in the input is also the value that gets saved.
  useEffect(() => {
    setNewRowDraft((prev) => ({ ...prev, date: getDefaultNewRowDate() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const listColumnStyle = useMemo(
    () =>
      ({
        "--list-cols": columnOrder
          .map((key) => COLUMN_TRACKS[key])
          .join(" "),
      }) as CSSProperties,
    [columnOrder]
  );

  function persistColumnOrder(next: ColumnKey[]) {
    setColumnOrder(next);
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preference simply won't survive a reload if storage is unavailable.
    }
  }

  function moveColumn(key: ColumnKey, offset: number) {
    const index = columnOrder.indexOf(key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= columnOrder.length) return;
    const next = [...columnOrder];
    next.splice(index, 1);
    next.splice(target, 0, key);
    persistColumnOrder(next);
  }

  function handleColumnDrop(targetKey: ColumnKey) {
    if (!dragColumn || dragColumn === targetKey) {
      setDragColumn(null);
      setDropTarget(null);
      return;
    }
    const next = columnOrder.filter((key) => key !== dragColumn);
    next.splice(columnOrder.indexOf(targetKey), 0, dragColumn);
    persistColumnOrder(next);
    setDragColumn(null);
    setDropTarget(null);
  }

  function selectSingleMonth(ref: MonthRef) {
    setSelectedMonths(new Set([monthKey(ref.year, ref.month)]));
  }

  function toggleMonth(ref: MonthRef) {
    setSelectedMonths((prev) => {
      const key = monthKey(ref.year, ref.month);
      const next = new Set(prev);
      if (next.has(key)) {
        // Always keep at least one month selected.
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleSelectMonth(ref: MonthRef, additive: boolean) {
    if (additive || multiSelect) {
      toggleMonth(ref);
    } else {
      selectSingleMonth(ref);
    }
  }

  function handleSelectYear(year: number) {
    const keys: string[] = [];
    for (let month = 1; month <= 12; month += 1) {
      keys.push(monthKey(year, month));
    }
    setSelectedMonths(new Set(keys));
    setWindowEnd({ year, month: 12 });
  }

  function shiftWindow(delta: number) {
    setWindowEnd((prev) => addMonths(prev, delta));
  }

  function resetWindow() {
    setWindowEnd(todayRef);
  }

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

    if (!hasPeriod) return map;

    categories.forEach((category) => {
      map.set(category.category, 0);
    });

    budgets.forEach((entry) => {
      if (!selectedMonths.has(monthKey(entry.year, entry.month))) return;
      const name = entry.category?.category;
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + entry.budget);
    });

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, categories, hasPeriod, selectedKey]);
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
      if (hasPeriod) {
        maxValue = Math.max(
          maxValue,
          budgetByCategoryName.get(category.name) ?? 0
        );
      }
    });

    return Math.max(maxValue, 1);
  }, [budgetByCategoryName, categoryTotals, hasPeriod]);
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
    if (!hasPeriod) {
      return { budgetTotal: 0, percentUsed: 0, remaining: 0, daysLeft: 0, dailyBudget: 0 };
    }

    let budgetTotal = 0;

    budgets.forEach((entry) => {
      const name = entry.category?.category;
      if (!name || isIncomeCategory(name)) return;
      if (!selectedMonths.has(monthKey(entry.year, entry.month))) return;
      budgetTotal += entry.budget;
    });

    const percentUsed =
      budgetTotal > 0 ? (summary.expensesTotal / budgetTotal) * 100 : 0;
    const remaining = budgetTotal - summary.expensesTotal;

    // Daily-budget pacing only makes sense for a single concrete month.
    let daysLeft = 0;
    let dailyBudget = 0;
    if (singleMonth) {
      const y = singleMonth.year;
      const m = singleMonth.month;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, hasPeriod, selectedKey, singleMonth, summary.expensesTotal]);

  const budgetInsights = useMemo(() => {
    if (!hasPeriod) return null;

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
  }, [budgetByCategoryName, categoryTotals, hasPeriod]);

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
    if (!singleMonth) {
      setBudgetStatus("Velg én måned for å redigere budsjett.");
      return;
    }

    const category = categoryByName.get(categoryName);
    if (!category) return;

    setBudgetStatus(null);
    const monthValue = singleMonth.month;
    const yearValue = singleMonth.year;
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
    if (!editingCategory || !singleMonth) return;

    const category = categoryByName.get(editingCategory);
    if (!category) return;

    const monthValue = singleMonth.month;
    const yearValue = singleMonth.year;
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
      await fetchBudgets(selectedYears);
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
      setHistoryVersion((version) => version + 1);
    }

    setDeletingId(null);
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
      setHistoryVersion((version) => version + 1);
      handleCancelEdit();
    }

    setEditSaving(false);
  }

  function getDefaultNewRowDate() {
    const now = new Date();
    if (singleMonth) {
      const y = singleMonth.year;
      const m = singleMonth.month;
      if (y === now.getFullYear() && m === now.getMonth() + 1) {
        return formatDateParts(y, m, now.getDate());
      }
      return formatDateParts(y, m, 1);
    }
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
      // Fall back to the default so the date shown in the input is what gets saved.
      date: newRowDraft.date || getDefaultNewRowDate(),
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
      setHistoryVersion((version) => version + 1);
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

  function renderMobileFieldInput(key: ColumnKey) {
    switch (key) {
      case "item":
        return (
          <input
            type="text"
            value={newRowDraft.item}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, item: e.target.value }))
            }
            placeholder="Hva brukte du penger på?"
          />
        );
      case "amount":
        return (
          <input
            type="number"
            value={newRowDraft.price}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, price: e.target.value }))
            }
            placeholder="0"
          />
        );
      case "category":
        return (
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
        );
      case "date":
        return (
          <input
            type="date"
            value={newRowDraft.date}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, date: e.target.value }))
            }
          />
        );
      case "tag":
        return (
          <input
            type="text"
            value={newRowDraft.tag}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, tag: e.target.value }))
            }
            placeholder="Valgfritt"
          />
        );
    }
  }

  function renderNewRowCell(key: ColumnKey) {
    switch (key) {
      case "date":
        return (
          <input
            key={key}
            className="cell-input"
            type="date"
            value={newRowDraft.date}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, date: e.target.value }))
            }
            aria-label="Dato"
          />
        );
      case "tag":
        return (
          <input
            key={key}
            className="cell-input"
            type="text"
            value={newRowDraft.tag}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, tag: e.target.value }))
            }
            placeholder="Merkelapp"
            aria-label="Merkelapp"
          />
        );
      case "item":
        return (
          <input
            key={key}
            className="cell-input"
            type="text"
            value={newRowDraft.item}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, item: e.target.value }))
            }
            placeholder="Beskrivelse"
            aria-label="Beskrivelse"
          />
        );
      case "amount":
        return (
          <input
            key={key}
            className="cell-input cell-input-number"
            type="number"
            value={newRowDraft.price}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, price: e.target.value }))
            }
            placeholder="Beløp"
            aria-label="Beløp"
          />
        );
      case "category":
        return (
          <select
            key={key}
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
        );
    }
  }

  function renderEditCell(key: ColumnKey) {
    switch (key) {
      case "date":
        return (
          <input
            key={key}
            className="cell-input"
            type="date"
            value={editDraft.date}
            onChange={(e) =>
              setEditDraft((prev) => ({ ...prev, date: e.target.value }))
            }
            aria-label="Dato"
          />
        );
      case "tag":
        return (
          <input
            key={key}
            className="cell-input"
            type="text"
            value={editDraft.tag}
            onChange={(e) =>
              setEditDraft((prev) => ({ ...prev, tag: e.target.value }))
            }
            placeholder="Merkelapp"
            aria-label="Merkelapp"
          />
        );
      case "item":
        return (
          <input
            key={key}
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
        );
      case "amount":
        return (
          <input
            key={key}
            className="cell-input cell-input-number"
            type="number"
            value={editDraft.price}
            onChange={(e) =>
              setEditDraft((prev) => ({ ...prev, price: e.target.value }))
            }
            placeholder="Beløp"
            aria-label="Beløp"
          />
        );
      case "category":
        return (
          <select
            key={key}
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
        );
    }
  }

  return (
    <main className="shell">
      <TopNav email={session.user.email} />
      <section className="card mobile-new-row-card"
        onKeyDown={(e) =>
          handleSpreadsheetKeyDown(e, handleSaveNewRow, () =>
            setNewRowDraft({
            item: "",
            price: "",
            categoryId: "",
            tag: "",
            date: getDefaultNewRowDate(),
          })
          )
        }
      >
        <h2 className="section-title">Ny transaksjon</h2>
        <div className="mobile-new-row-grid">
          {columnOrder.map((key, index) => (
            <div className="field" key={key}>
              <div className="field-label-row">
                <label>{COLUMN_LABELS[key]}</label>
                <div className="field-move">
                  <button
                    type="button"
                    onClick={() => moveColumn(key, -1)}
                    disabled={index === 0}
                    aria-label={`Flytt ${COLUMN_LABELS[key]} tidligere`}
                    title="Flytt tidligere"
                  >
                    <IconChevronUp />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(key, 1)}
                    disabled={index === columnOrder.length - 1}
                    aria-label={`Flytt ${COLUMN_LABELS[key]} senere`}
                    title="Flytt senere"
                  >
                    <IconChevronDown />
                  </button>
                </div>
              </div>
              {renderMobileFieldInput(key)}
            </div>
          ))}
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

      {budgetSummary.budgetTotal > 0 ? (
        <section className="card section-gap gauge-card" style={{
          "--gauge-pct": Math.min(budgetSummary.percentUsed, 100),
          "--gauge-color": budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "var(--gauge-warn)" : "var(--income)",
        } as CSSProperties}>
          <div className="gauge-layout">
            <div className="gauge-ring-wrap">
              <div className="gauge-ring" />
              <div className="gauge-center">
                <span className="gauge-pct" style={{
                  color: budgetSummary.percentUsed > 100 ? "var(--expense)" : budgetSummary.percentUsed > 75 ? "var(--gauge-warn-ink)" : "var(--income)",
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
                    background: `hsl(${item.hue} var(--seg-s) var(--seg-l))`,
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
                  <span className="breakdown-dot" style={{ background: `hsl(${item.hue} var(--seg-s) var(--seg-l))` }} />
                  <span className="breakdown-legend-name">{item.name}</span>
                  <span className="breakdown-legend-value">{formatCurrency(item.total)}</span>
                  <span className="breakdown-legend-pct">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <MonthOverMonth
        entries={historyEntries}
        anchor={anchor}
        selectedKeys={selectedMonths}
        single={selectedMonthRef}
        years={yearButtons}
        multiSelect={multiSelect}
        onSelectMonth={handleSelectMonth}
        onSelectYear={handleSelectYear}
        onShiftWindow={shiftWindow}
        onResetWindow={resetWindow}
        onToggleMultiSelect={() => setMultiSelect((value) => !value)}
      />

      <Anomalies
        entries={historyEntries}
        selected={selectedMonthRef}
        periodLabel={periodLabel}
      />

      <section
        className={`card section-gap category-card${editingCategory ? " editing" : ""}`}
      >
        <div className="category-head">
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
              <div className="category-chart-list" id="category-list">
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
                const canEditBudget = Boolean(singleMonth);
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
                            : `hsl(${catHue} var(--dot-s) var(--dot-l))`,
                        }} />
                        <strong className={isIncome ? "text-income" : ""}>
                          {category.name}
                        </strong>
                      </div>
                      <div className="category-chart-values">
                        <span className="category-value">
                          {formatCurrency(category.total)}
                        </span>
                        {hasPeriod && hasBudget && !isIncome ? (
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
                        ) : hasPeriod && !isIncome ? (
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
                          canEditBudget ? "Rediger budsjett" : "Velg én måned"
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
                          : `hsl(${catHue} var(--bar-s) var(--bar-l))`,
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
          </>
        ) : null}
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
          <div className="list" style={listColumnStyle}>
            <div className="list-header" role="row">
              {columnOrder.map((key) => (
                <button
                  key={key}
                  className={`list-sort draggable ${
                    activitySort.key === key ? "active" : ""
                  } ${dragColumn === key ? "dragging" : ""} ${
                    dropTarget === key && dragColumn && dragColumn !== key
                      ? "drop-target"
                      : ""
                  }`}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragColumn(key);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragColumn(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget(key);
                  }}
                  onDragLeave={() =>
                    setDropTarget((prev) => (prev === key ? null : prev))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    handleColumnDrop(key);
                  }}
                  onClick={() => handleActivitySort(key)}
                  title="Klikk for å sortere, dra for å flytte kolonnen"
                >
                  {COLUMN_LABELS[key]}
                  <span className="list-sort-indicator">
                    {getSortIndicator(key)}
                  </span>
                </button>
              ))}
              <span className="list-sort empty" aria-hidden="true" />
            </div>
            <div
              className="list-row new-row"
              onKeyDown={(e) =>
                handleSpreadsheetKeyDown(e, handleSaveNewRow, () =>
                  setNewRowDraft({
            item: "",
            price: "",
            categoryId: "",
            tag: "",
            date: getDefaultNewRowDate(),
          })
                )
              }
            >
              {columnOrder.map((key) => renderNewRowCell(key))}
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
                    {columnOrder.map((key) => renderEditCell(key))}
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
                  {columnOrder.map((key) => {
                    switch (key) {
                      case "date":
                        return <span key={key}>{formatDate(expense.date)}</span>;
                      case "tag":
                        return <span key={key}>{expense.tag ?? ""}</span>;
                      case "item":
                        return <strong key={key}>{expense.item}</strong>;
                      case "amount":
                        return (
                          <strong
                            key={key}
                            className={isIncome ? "text-income" : ""}
                          >
                            {isIncome ? `+${amount}` : `-${amount}`}
                          </strong>
                        );
                      case "category":
                        return (
                          <span
                            key={key}
                            className="category-pill"
                            style={categoryStyle}
                          >
                            {categoryName}
                          </span>
                        );
                    }
                  })}
                  <button
                    className="edit-button"
                    type="button"
                    onClick={() => handleStartEdit(expense)}
                    aria-label={`Rediger ${expense.item}`}
                  >
                    Rediger
                  </button>
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
