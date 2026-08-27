"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  useLedger,
  useLedgerHistory,
  useLedgerSelection,
  type LedgerExpense,
} from "@/components/LedgerProvider";
import RecurringPanel from "@/components/RecurringPanel";
import ItemAutocomplete from "@/components/ItemAutocomplete";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabaseClient";
import { categoryInk, categoryTint, getCategorySlot } from "@/lib/categoryColor";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
  IconX,
} from "@/components/icons";
import { useToast } from "@/lib/useToast";
import { usePeriod } from "@/lib/usePeriod";
import { refToKey } from "@/lib/period";
import {
  formatCurrency,
  formatDate,
  formatDateParts,
  toNumber,
} from "@/lib/format";
import { buildItemIndex, type ItemSuggestion } from "@/lib/autocomplete";
import type { MonthRef } from "@/lib/insights";
import {
  isIncomeKind,
  toCategoryKind,
  type CategoryKind,
} from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import { encField } from "@/lib/crypto";
import styles from "./transaksjoner.module.css";

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
  kind: CategoryKind;
};

// The page derives its rows from the ledger provider now; this is just the
// provider's shape under the page's existing local name.
type Expense = LedgerExpense;

function compareTextValues(a: string, b: string) {
  return a.localeCompare(b, "nb", { sensitivity: "base" });
}

function getExpenseCategoryLabel(expense: Expense) {
  return expense.category?.category || "Ukategorisert";
}

function getExpenseKind(expense: Expense): CategoryKind {
  return expense.category?.kind ?? "variable";
}

// Deliberately NOT split on isSpendingKind vs. isSavingsKind here: the
// activity table is a ledger of individual transactions, and a transfer into
// savings genuinely is money leaving the account, so a negative row is
// truthful in this context. (The "Utgifter" total below this reads from,
// however, conflates spending and savings under one label — a copy decision
// deferred to the phase that makes savings reachable from the UI.)
function getSignedAmount(expense: Expense) {
  const value = toNumber(expense.price);
  return isIncomeKind(getExpenseKind(expense)) ? value : -value;
}

export default function TransaksjonerPage() {
  const ledger = useLedger();
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, single, anchor } = usePeriod(fallback);
  const historyEntries = useLedgerHistory(anchor);
  const expenses = useLedgerSelection(selectedKeys);

  const [status, setStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast, showToast, dismissToast } = useToast();
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
  const newRowItemRef = useRef<HTMLInputElement | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(
    DEFAULT_COLUMN_ORDER
  );
  const [dragColumn, setDragColumn] = useState<ColumnKey | null>(null);
  const [dropTarget, setDropTarget] = useState<ColumnKey | null>(null);
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
  // Off by default: the filter otherwise silently hides matches outside the
  // selected months, which is the trap this toggle exists to avoid. When on,
  // it widens to the ledger provider's fetched window — not all of history,
  // see the scope line rendered next to the toggle.
  const [searchWholeWindow, setSearchWholeWindow] = useState(false);

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

  const loading = ledger.loading;

  // Whether the selected month falls inside the ledger's fetched window.
  // ensureMonthCovered (owned by PeriodPicker in the layout) widens that window
  // asynchronously, so on the render right after picking an uncovered month,
  // `expenses` is still empty and `loading` is still false — a state the
  // loading/error flags alone cannot express. RecurringPanel needs this
  // distinction to tell "genuinely no bookings this month" from "haven't
  // fetched this month yet", so it doesn't offer to generate fixed expenses
  // that may already exist.
  const covered = useMemo(() => {
    if (!single) return false;
    const value = single.year * 12 + single.month;
    const start = ledger.windowStart.year * 12 + ledger.windowStart.month;
    const end = ledger.windowEnd.year * 12 + ledger.windowEnd.month;
    return value >= start && value <= end;
  }, [single, ledger.windowStart, ledger.windowEnd]);

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
  }, [selectedKeys]);

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

  // The all-time-search toggle widens the source array for every downstream
  // view of the activity table (filter options, filtering/sorting, and the
  // empty-state check) so the widened search isn't only half-widened.
  const activitySource = searchWholeWindow ? ledger.expenses : expenses;

  const activityTagOptions = useMemo(() => {
    const tags = new Set<string>();
    activitySource.forEach((expense) => {
      const value = expense.tag?.trim();
      if (value) tags.add(value);
    });
    return Array.from(tags).sort(compareTextValues);
  }, [activitySource]);
  const activityCategoryOptions = useMemo(() => {
    const categoryNames = new Set<string>();
    activitySource.forEach((expense) => {
      categoryNames.add(getExpenseCategoryLabel(expense));
    });
    return Array.from(categoryNames).sort((a, b) => {
      const aIncome = isIncomeKind(kindOfCategory(a));
      const bIncome = isIncomeKind(kindOfCategory(b));
      if (aIncome !== bIncome) {
        return aIncome ? -1 : 1;
      }
      return compareTextValues(a, b);
    });
  }, [activitySource, kindOfCategory]);
  // Suggestions come from the trailing 12-month history rather than the
  // selected months, so a purchase you make twice a year is still offered.
  // historyEntries carries a category *name*, so map it back to an id through
  // the lookup the page already builds.
  const itemIndex = useMemo(
    () =>
      buildItemIndex(
        historyEntries.map((entry) => ({
          item: entry.item,
          price: entry.amount,
          category_id: categoryByName.get(entry.category)?.id ?? 0,
          tag: entry.tag,
          date: entry.date,
        }))
      ),
    [categoryByName, historyEntries]
  );
  const filteredAndSortedExpenses = useMemo(() => {
    const filtered = activitySource.filter((expense) => {
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
  }, [activityFilters, activitySort, activitySource]);
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

  // The toggle widens to the provider's fetch window, not to all of history
  // (ledger.availableMonths may reach further back) — so the copy states the
  // actual month count and range rather than implying completeness.
  const searchWindowLabel = useMemo(() => {
    const start = ledger.windowStart;
    const end = ledger.windowEnd;
    const monthCount =
      (end.year * 12 + end.month) - (start.year * 12 + start.month) + 1;
    const startKey = refToKey(start);
    const endKey = refToKey(end);
    return `Søker i ${monthCount} måneder (${startKey}–${endKey})`;
  }, [ledger.windowStart, ledger.windowEnd]);

  const exportFilename = useMemo(() => {
    const sanitize = (key: string) => key.replace(/[^0-9A-Za-z_-]/g, "");
    if (searchWholeWindow) {
      const start = sanitize(refToKey(ledger.windowStart));
      const end = sanitize(refToKey(ledger.windowEnd));
      return `transaksjoner-${start}-til-${end}.csv`;
    }
    if (single) {
      return `transaksjoner-${sanitize(refToKey(single))}.csv`;
    }
    const sortedKeys = Array.from(selectedKeys).sort();
    if (sortedKeys.length === 0) {
      return `transaksjoner-${sanitize(refToKey(anchor))}.csv`;
    }
    if (sortedKeys.length === 1) {
      return `transaksjoner-${sanitize(sortedKeys[0])}.csv`;
    }
    const first = sanitize(sortedKeys[0]);
    const last = sanitize(sortedKeys[sortedKeys.length - 1]);
    return `transaksjoner-${first}-til-${last}.csv`;
  }, [anchor, ledger.windowEnd, ledger.windowStart, searchWholeWindow, selectedKeys, single]);

  function handleExportCsv() {
    if (filteredAndSortedExpenses.length === 0) return;

    const headers = columnOrder.map((key) => COLUMN_LABELS[key]);
    const rows = filteredAndSortedExpenses.map((expense) =>
      columnOrder.map((key) => {
        switch (key) {
          case "date":
            return expense.date ?? "";
          case "tag":
            return expense.tag ?? "";
          case "item":
            return expense.item;
          case "amount":
            return getSignedAmount(expense);
          case "category":
            return getExpenseCategoryLabel(expense);
          default:
            return "";
        }
      })
    );

    const csv = toCsv(headers, rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFilename;
    link.click();
    URL.revokeObjectURL(url);
  }

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

  // "n" jumps to the new-transaction row and "/" jumps to the description
  // filter, from anywhere on the page, as long as the user is not already
  // typing into a field.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "/") return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (target?.isContentEditable) return;

      event.preventDefault();
      if (event.key === "n") {
        newRowItemRef.current?.focus();
      } else {
        document.getElementById("activity-item-query")?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const emptyState = !loading && activitySource.length === 0;

  async function handleRestore(expense: Expense) {
    const { data, error } = await supabase
      .from("expense")
      .insert({
        item: await encField(expense.item),
        price: await encField(toNumber(expense.price)),
        category_id: expense.category_id,
        tag: await encField(expense.tag),
        user_id: ledger.userId,
        date: expense.date,
        recurring_id: expense.recurring_id,
      })
      .select(
        "id, item, price, category_id, tag, user_id, date, recurring_id, category(id, category, kind)"
      );

    if (error) {
      showToast({ message: error.message, tone: "error" });
      return;
    }

    if (data?.length) {
      const entry = data[0] as any;
      const rawCategory = Array.isArray(entry.category)
        ? entry.category[0] ?? null
        : entry.category ?? null;
      const category = rawCategory
        ? { ...rawCategory, kind: toCategoryKind(rawCategory.kind) }
        : null;
      const normalized: LedgerExpense = {
        ...entry,
        // The row comes back encrypted, and there is nothing to learn from
        // decrypting it: these three values are the ones just sent.
        item: expense.item,
        price: toNumber(expense.price),
        tag: expense.tag,
        category,
      };
      ledger.upsertExpense(normalized);
    }
  }

  async function handleDelete(expense: Expense) {
    setDeletingId(expense.id);
    setStatus(null);

    const { error } = await supabase
      .from("expense")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", ledger.userId);

    if (error) {
      showToast({ message: error.message, tone: "error" });
    } else {
      ledger.removeExpense(expense.id);
      showToast({
        message: `Slettet ${expense.item}.`,
        tone: "info",
        actionLabel: "Angre",
        // Restoring re-inserts the row, so it comes back with a new id.
        onAction: () => handleRestore(expense),
      });
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

  // The editing row unmounts (its <input> with it) the instant
  // editingExpenseId clears, so focus falls to document.body unless we
  // explicitly move it back to the display row that replaces the editor.
  // That row doesn't exist in the DOM until after this render commits, so
  // the focus call has to wait a frame.
  function focusExpenseRow(id: number) {
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-expense-id="${id}"]`
      );
      row?.focus();
    });
  }

  function handleCancelEdit() {
    const id = editingExpenseId;
    setEditingExpenseId(null);
    setEditDraft({ item: "", price: "", categoryId: "", tag: "", date: "" });
    if (id != null) focusExpenseRow(id);
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
        item: await encField(editDraft.item.trim()),
        price: await encField(Math.round(parsed)),
        category_id: Number(editDraft.categoryId),
        tag: await encField(editDraft.tag.trim() || null),
        date: editDraft.date || null,
      })
      .eq("id", editingExpenseId)
      .eq("user_id", ledger.userId);

    if (error) {
      setStatus(error.message);
    } else {
      const updatedCategory =
        ledger.categories.find((c) => c.id === Number(editDraft.categoryId)) ??
        null;
      const existing = activitySource.find((e) => e.id === editingExpenseId);
      if (existing) {
        ledger.upsertExpense({
          ...existing,
          item: editDraft.item.trim(),
          price: Math.round(parsed),
          category_id: Number(editDraft.categoryId),
          tag: editDraft.tag.trim() || null,
          date: editDraft.date || null,
          category: updatedCategory,
        });
      }
      handleCancelEdit();
    }

    setEditSaving(false);
  }

  function getDefaultNewRowDate() {
    const now = new Date();
    if (single) {
      const y = single.year;
      const m = single.month;
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

    const item = newRowDraft.item.trim();
    const price = Math.round(Math.abs(parsed));
    const tag = newRowDraft.tag.trim() || null;

    const payload = {
      item: await encField(item),
      price: await encField(price),
      category_id: Number(newRowDraft.categoryId),
      tag: await encField(tag),
      user_id: ledger.userId,
      // Fall back to the default so the date shown in the input is what gets saved.
      date: newRowDraft.date || getDefaultNewRowDate(),
    };

    const { data, error } = await supabase
      .from("expense")
      .insert(payload)
      .select("id, item, price, category_id, tag, user_id, date, recurring_id, category(id, category, kind)");

    if (error) {
      setStatus(error.message);
    } else if (data?.length) {
      const entry = data[0] as any;
      const rawCategory = Array.isArray(entry.category)
        ? entry.category[0] ?? null
        : entry.category ?? null;
      const category = rawCategory
        ? { ...rawCategory, kind: toCategoryKind(rawCategory.kind) }
        : null;
      const normalized: LedgerExpense = {
        ...entry,
        // As in handleRestore: the plaintext is right here, the row that came
        // back is ciphertext.
        item,
        price,
        tag,
        category,
      };
      ledger.upsertExpense(normalized);
      setNewRowDraft({
        item: "",
        price: "",
        categoryId: newRowDraft.categoryId,
        tag: newRowDraft.tag,
        date: newRowDraft.date,
      });
      newRowItemRef.current?.focus();
    }

    setNewRowSaving(false);
  }

  function applySuggestionToNewRow(suggestion: ItemSuggestion) {
    setNewRowDraft((prev) => ({
      ...prev,
      item: suggestion.item,
      // A zero id means the category was not resolvable; keep what is there.
      categoryId: suggestion.categoryId
        ? String(suggestion.categoryId)
        : prev.categoryId,
      price: String(suggestion.price),
      tag: suggestion.tag ?? prev.tag,
    }));
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
    // Matches the htmlFor the label beside it uses.
    const id = `mobile-new-${key}`;
    switch (key) {
      case "item":
        return (
          <ItemAutocomplete
            value={newRowDraft.item}
            onChange={(item) =>
              setNewRowDraft((prev) => ({ ...prev, item }))
            }
            onSelect={applySuggestionToNewRow}
            index={itemIndex}
            placeholder="Hva brukte du penger på?"
            ariaLabel="Beskrivelse"
            inputId={id}
          />
        );
      case "amount":
        return (
          <input
            id={id}
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
            id={id}
            value={newRowDraft.categoryId}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, categoryId: e.target.value }))
            }
          >
            <option value="">Velg kategori...</option>
            {ledger.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.category}
              </option>
            ))}
          </select>
        );
      case "date":
        return (
          <input
            id={id}
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
            id={id}
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
            className={styles["cell-input"]}
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
            className={styles["cell-input"]}
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
          <ItemAutocomplete
            key={key}
            className={styles["cell-input"]}
            inputRef={newRowItemRef}
            value={newRowDraft.item}
            onChange={(item) =>
              setNewRowDraft((prev) => ({ ...prev, item }))
            }
            onSelect={applySuggestionToNewRow}
            index={itemIndex}
            placeholder="Beskrivelse"
            ariaLabel="Beskrivelse"
          />
        );
      case "amount":
        return (
          <input
            key={key}
            className={`${styles["cell-input"]} ${styles["cell-input-number"]}`}
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
            className={styles["cell-input"]}
            value={newRowDraft.categoryId}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, categoryId: e.target.value }))
            }
            aria-label="Kategori"
          >
            <option value="">Kategori...</option>
            {ledger.categories.map((c) => (
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
            className={styles["cell-input"]}
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
            className={styles["cell-input"]}
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
            className={styles["cell-input"]}
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
            className={`${styles["cell-input"]} ${styles["cell-input-number"]}`}
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
            className={styles["cell-input"]}
            value={editDraft.categoryId}
            onChange={(e) =>
              setEditDraft((prev) => ({ ...prev, categoryId: e.target.value }))
            }
            aria-label="Kategori"
          >
            <option value="">Kategori...</option>
            {ledger.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.category}
              </option>
            ))}
          </select>
        );
    }
  }

  return (
    <>
      <section className={`card ${styles["mobile-new-row-card"]}`}
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
        <div className={styles["mobile-new-row-grid"]}>
          {columnOrder.map((key, index) => (
            <div className="field" key={key}>
              <div className="field-label-row">
                <label htmlFor={`mobile-new-${key}`}>
                  {COLUMN_LABELS[key]}
                </label>
                <div className="field-move">
                  <button
                    className="icon-btn icon-btn-sm"
                    type="button"
                    onClick={() => moveColumn(key, -1)}
                    disabled={index === 0}
                    aria-label={`Flytt ${COLUMN_LABELS[key]} tidligere`}
                    title="Flytt tidligere"
                  >
                    <IconChevronUp />
                  </button>
                  <button
                    className="icon-btn icon-btn-sm"
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

      <RecurringPanel
        userId={ledger.userId}
        month={single}
        monthLabel={`${selectedMonthLabel} ${single?.year ?? ""}`.trim()}
        bookedExpenses={expenses}
        bookedLoading={ledger.loading}
        bookedKnown={!ledger.error && covered}
        categories={ledger.categories}
        onGenerated={() => {
          ledger.refetch();
        }}
      />

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Aktivitet</h2>
          <span className="helper">Sortert på {activitySortLabel}</span>
        </div>
        {status ? <div className="status">{status}</div> : null}
        <div className="toolbar">
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
          <label className="toolbar-check" htmlFor="activity-search-whole-window">
            <input
              id="activity-search-whole-window"
              type="checkbox"
              checked={searchWholeWindow}
              onChange={(event) => setSearchWholeWindow(event.target.checked)}
            />
            Søk i hele perioden
          </label>
          <div className="toolbar-actions">
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={clearActivityFilters}
              disabled={!hasActivityFilters}
            >
              Nullstill filtre
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={handleExportCsv}
              disabled={filteredAndSortedExpenses.length === 0}
            >
              Eksporter CSV
            </button>
          </div>
        </div>
        {searchWholeWindow ? (
          <div className="helper">{searchWindowLabel}</div>
        ) : null}
        <div className={`stat-row ${styles["activity-total-row"]}`}>
          <div className="stat">
            <span className="stat-label">{activityTotalLabel}</span>
            <strong
              className={`stat-value ${activityTotals.net >= 0 ? "is-good" : "is-bad"}`}
            >
              {activityTotals.net >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(activityTotals.net))}
            </strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Inntekter</span>
            <strong className="stat-value">
              {formatCurrency(activityTotals.income)}
            </strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Utgifter</span>
            <strong className="stat-value">
              {formatCurrency(activityTotals.expense)}
            </strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Transaksjoner</span>
            <strong className="stat-value">{activityTotals.count}</strong>
          </div>
        </div>
        {loading ? <div className="helper">Laster transaksjoner...</div> : null}
        {!loading ? (
          <div className={styles["list"]} style={listColumnStyle}>
            <div className={styles["list-header"]} role="row">
              {columnOrder.map((key) => (
                <button
                  key={key}
                  className={`${styles["list-sort"]} ${styles["draggable"]} ${
                    key === "amount" ? styles["align-end"] : ""
                  } ${activitySort.key === key ? styles["active"] : ""} ${
                    dragColumn === key ? styles["dragging"] : ""
                  } ${
                    dropTarget === key && dragColumn && dragColumn !== key
                      ? styles["drop-target"]
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
                  <span className={styles["list-sort-indicator"]}>
                    {getSortIndicator(key)}
                  </span>
                </button>
              ))}
              <span className={`${styles["list-sort"]} ${styles["empty"]}`} aria-hidden="true" />
            </div>
            <div
              className={`${styles["list-row"]} ${styles["new-row"]}`}
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
                className="icon-btn icon-btn-confirm"
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
                "--cat-bg": categoryTint(getCategorySlot(categoryName)),
                "--cat-ink": categoryInk(getCategorySlot(categoryName)),
              } as CSSProperties;
              const isEditing = editingExpenseId === expense.id;

              if (isEditing) {
                return (
                  <div
                    key={expense.id}
                    className={`${styles["list-row"]} ${styles["editing-row"]}`}
                    onKeyDown={(e) =>
                      handleSpreadsheetKeyDown(e, handleSaveEdit, handleCancelEdit)
                    }
                  >
                    {columnOrder.map((key) => renderEditCell(key))}
                    <div className={styles["row-actions"]}>
                      <button
                        className="icon-btn icon-btn-confirm"
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        aria-label="Lagre"
                        title="Lagre (Enter)"
                      >
                        {editSaving ? "..." : <IconCheck />}
                      </button>
                      <button
                        className="icon-btn icon-btn-dismiss"
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
                  data-expense-id={expense.id}
                  className={`${styles["list-row"]} ${isIncome ? styles["income-row"] : ""}`}
                  role="row"
                  tabIndex={0}
                  onDoubleClick={() => handleStartEdit(expense)}
                  onKeyDown={(event) => {
                    // Let the row's own buttons keep their Enter.
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleStartEdit(expense);
                    }
                  }}
                  title="Dobbeltklikk eller trykk Enter for å redigere"
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
                            className={`num ${isIncome ? "text-income" : ""}`}
                          >
                            {isIncome ? `+${amount}` : `-${amount}`}
                          </strong>
                        );
                      case "category":
                        return (
                          <span
                            key={key}
                            className={styles["category-pill"]}
                            style={categoryStyle}
                          >
                            {categoryName}
                          </span>
                        );
                    }
                  })}
                  <button
                    className={styles["edit-button"]}
                    type="button"
                    onClick={() => handleStartEdit(expense)}
                    aria-label={`Rediger ${expense.item}`}
                  >
                    Rediger
                  </button>
                  <button
                    className={`icon-btn icon-btn-danger ${styles["row-delete"]}`}
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
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
