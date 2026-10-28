"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  useLedger,
  useLedgerHistory,
  useLedgerSelection,
  type LedgerExpense,
} from "@/components/LedgerProvider";
import MoreMenu from "@/components/MoreMenu";
import DateRangePicker from "@/components/DateRangePicker";
import ItemAutocomplete from "@/components/ItemAutocomplete";
import TagSelect from "@/components/TagSelect";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabaseClient";
import { categoryColor, categoryInk, categoryTint, getCategorySlot } from "@/lib/categoryColor";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@/components/icons";
import { useToast } from "@/lib/useToast";
import { usePeriod } from "@/lib/usePeriod";
import { keyToRef, refToKey } from "@/lib/period";
import {
  formatCurrency,
  formatDate,
  formatDateParts,
  toNumber,
} from "@/lib/format";
import { buildItemIndex, type ItemSuggestion } from "@/lib/autocomplete";
import { monthKey, type MonthRef } from "@/lib/insights";
import { materializationDate, pendingTemplates, type RecurringTemplate } from "@/lib/recurring";
import { missingFixedRef, useDismissals } from "@/lib/dismissals";
import {
  isIncomeKind,
  toCategoryKind,
  type CategoryKind,
} from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import {
  expenseKey,
  guessKind,
  parseExpenseCsv,
  type ExpenseImport,
} from "@/lib/importExpenses";
import { encField } from "@/lib/crypto";
import { findTagByName, tagForDate, tagLabels } from "@/lib/tags";
import styles from "./transaksjoner.module.css";

// One filter per column, laid out in the table's own grid under its header,
// so each control sits above what it narrows. Dates and amounts are ranges;
// either end may be left open.
type ActivityFilters = {
  dateFrom: string;
  dateTo: string;
  tag: string;
  itemQuery: string;
  minAmount: string;
  maxAmount: string;
  category: string;
};

const NO_FILTERS: ActivityFilters = {
  dateFrom: "",
  dateTo: "",
  tag: "",
  itemQuery: "",
  minAmount: "",
  maxAmount: "",
  category: "",
};

type ActivitySortKey = "date" | "tag" | "item" | "amount" | "category";

type ActivitySortDirection = "asc" | "desc";

type ColumnKey = ActivitySortKey;

// Fixed. The order used to be a per-device preference (drag the headers, or
// arrows in the phone form), which was more machinery than a five-column table
// earns — and it put reorder arrows beside every label of the form used most.
const columnOrder: ColumnKey[] = ["date", "tag", "item", "amount", "category"];

const COLUMN_TRACKS: Record<ColumnKey, string> = {
  date: "minmax(88px, 0.82fr)",
  tag: "minmax(72px, 0.68fr)",
  item: "minmax(140px, 1.55fr)",
  amount: "minmax(96px, 0.95fr)",
  category: "minmax(106px, 1fr)",
};

const listColumnStyle = {
  "--list-cols": columnOrder.map((key) => COLUMN_TRACKS[key]).join(" "),
} as CSSProperties;

const COLUMN_LABELS: Record<ColumnKey, string> = {
  date: "Dato",
  tag: "Merkelapp",
  item: "Beskrivelse",
  amount: "Beløp",
  category: "Kategori",
};

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
  // `tag` is a tag id; until one is picked by hand (`tagPicked`), the
  // merkelapp whose dates hold the draft's date is used instead.
  const [newRowDraft, setNewRowDraft] = useState({
    item: "",
    price: "",
    categoryId: "",
    tag: "",
    tagPicked: false,
    date: "",
  });
  const [newRowSaving, setNewRowSaving] = useState(false);
  const newRowItemRef = useRef<HTMLInputElement | null>(null);
  // The filter row is closed by default: most visits are to add a purchase or
  // glance at the month, and four controls above the list pushed it down.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(NO_FILTERS);
  const [activitySort, setActivitySort] = useState<{
    key: ActivitySortKey;
    direction: ActivitySortDirection;
  }>({
    key: "date",
    direction: "desc",
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ExpenseImport | null>(null);
  const [importName, setImportName] = useState("");
  const [importCategoryId, setImportCategoryId] = useState("");
  const [importing, setImporting] = useState(false);
  const importFile = useRef<HTMLInputElement | null>(null);

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

  // --- Fixed expenses, as rows in the list ---
  //
  // The month's active templates that have not been booked show up at the top
  // of the list as dashed suggestion rows, each with a tick (book it) and a
  // cross (not this month). This replaced a separate collapsible card whose
  // one button booked every template at once — it could not say "not the
  // gym this month" without pausing the template for every month.
  const { isDismissed, dismiss, restoreAll } = useDismissals();
  const periodKey = single ? monthKey(single.year, single.month) : "";
  const allPendingFixed = useMemo(
    () =>
      single
        ? pendingTemplates(
            ledger.templates,
            expenses,
            single.year,
            single.month,
            // Unknown bookings must never read as "not booked": that would
            // offer to book a month twice.
            !ledger.error && !ledger.loading && covered
          )
        : [],
    [single, ledger.templates, expenses, ledger.error, ledger.loading, covered]
  );
  const pendingFixed = allPendingFixed.filter(
    (template) => !isDismissed("missing-fixed", missingFixedRef(template.id, periodKey))
  );
  const skippedFixed = allPendingFixed.length - pendingFixed.length;
  const [bookingFixed, setBookingFixed] = useState(false);

  async function bookFixed(templates: RecurringTemplate[]) {
    if (!single || !templates.length) return;
    setBookingFixed(true);
    setStatus(null);
    const rows = await Promise.all(
      templates.map(async (template) => ({
        item: await encField(template.item),
        price: await encField(template.price),
        category_id: template.category_id,
        user_id: ledger.userId,
        date: materializationDate(template, single.year, single.month),
        recurring_id: template.id,
      }))
    );
    const { data, error } = await supabase
      .from("expense")
      .insert(rows)
      .select("id, category_id, user_id, date, recurring_id");
    if (error) {
      setStatus(error.message);
    } else {
      // The rows come back as ciphertext; the plaintext is the template's.
      (data ?? []).forEach((row: any) => {
        const template = templates.find((t) => t.id === row.recurring_id);
        if (!template) return;
        ledger.upsertExpense({
          ...row,
          item: template.item,
          price: template.price,
          tag_id: null,
          tag: null,
          category: ledger.categories.find((c) => c.id === row.category_id) ?? null,
        });
      });
    }
    setBookingFixed(false);
  }

  // Keep the new-row date in sync with the viewed period so the value shown
  // in the input is also the value that gets saved.
  useEffect(() => {
    setNewRowDraft((prev) => ({ ...prev, date: getDefaultNewRowDate() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys]);

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

  // A date range takes over from the period picker: the list then searches the
  // whole ledger between those dates, whatever month is selected above. This
  // replaced a "Valgt periode / Alle måneder" select — a range says the same
  // thing and more. An open end runs to the edge of the user's history.
  const rangeActive = Boolean(activityFilters.dateFrom || activityFilters.dateTo);
  const activitySource = rangeActive ? ledger.expenses : expenses;

  // availableMonths is all-time by design, so its ends are the real bounds of
  // the user's history. ensureMonthCovered only ever widens, and returns the
  // identical state when nothing needs widening, so this settles after one
  // fetch instead of looping.
  useEffect(() => {
    if (!rangeActive || !ledger.availableMonths.length) return;
    const months = ledger.availableMonths;
    ledger.ensureMonthCovered(
      keyToRef(activityFilters.dateFrom ? activityFilters.dateFrom.slice(0, 7) : months[0])
    );
    ledger.ensureMonthCovered(
      keyToRef(activityFilters.dateTo ? activityFilters.dateTo.slice(0, 7) : months[months.length - 1])
    );
  }, [
    rangeActive,
    activityFilters.dateFrom,
    activityFilters.dateTo,
    ledger.availableMonths,
    ledger.ensureMonthCovered,
  ]);

  // By id, not name: two trips may share a name, and the labels tell them apart.
  const activityTagOptions = useMemo(() => {
    const used = new Set(activitySource.map((expense) => expense.tag_id));
    const labels = tagLabels(ledger.tags);
    return ledger.tags
      .filter((tag) => used.has(tag.id))
      .map((tag) => ({ value: String(tag.id), label: labels.get(tag.id) ?? tag.name }));
  }, [activitySource, ledger.tags]);
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
          date: entry.date,
        }))
      ),
    [categoryByName, historyEntries]
  );
  const filteredAndSortedExpenses = useMemo(() => {
    const filtered = activitySource.filter((expense) => {
      const categoryName = getExpenseCategoryLabel(expense);
      const itemValue = expense.item.trim().toLowerCase();
      const itemQuery = activityFilters.itemQuery.trim().toLowerCase();
      const date = expense.date ?? "";
      const amount = Math.abs(toNumber(expense.price));
      const min = activityFilters.minAmount.trim();
      const max = activityFilters.maxAmount.trim();

      if (activityFilters.dateFrom && date < activityFilters.dateFrom) return false;
      if (activityFilters.dateTo && date > activityFilters.dateTo) return false;
      if (min && amount < Number(min)) return false;
      if (max && amount > Number(max)) return false;
      if (activityFilters.tag && String(expense.tag_id) !== activityFilters.tag) {
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
  // Counted for the closed toggle, so a filter left on is never invisible.
  // A range counts once, not once per end.
  const activeFilterCount = [
    rangeActive,
    activityFilters.tag,
    activityFilters.itemQuery.trim(),
    activityFilters.minAmount.trim() || activityFilters.maxAmount.trim(),
    activityFilters.category,
  ].filter(Boolean).length;
  const hasActivityFilters = activeFilterCount > 0;

  const exportFilename = useMemo(() => {
    const sanitize = (key: string) => key.replace(/[^0-9A-Za-z_-]/g, "");
    if (rangeActive) {
      const start = sanitize(activityFilters.dateFrom) || "start";
      const end = sanitize(activityFilters.dateTo) || "slutt";
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
  }, [anchor, rangeActive, activityFilters.dateFrom, activityFilters.dateTo, selectedKeys, single]);

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

  // --- CSV import ------------------------------------------------------
  // Names in the file are resolved against the account's own categories, case
  // insensitively; whatever is left over is created on confirm.
  const categoryIdByName = useMemo(() => {
    const map = new Map<string, number>();
    ledger.categories.forEach((category) =>
      map.set(category.category.trim().toLowerCase(), category.id)
    );
    return map;
  }, [ledger.categories]);

  // Re-importing the same file must not double the ledger, and `expense` has
  // no unique constraint to lean on (its columns are ciphertext, so it cannot
  // have one). ponytail: compared against the fetched window only — a row
  // outside it is invisible to this check. Set the scope to "Alle måneder"
  // before importing an old file, which loads all of it.
  const existingKeys = useMemo(
    () =>
      new Set(
        ledger.expenses.map((expense) =>
          expenseKey({
            date: expense.date,
            item: expense.item,
            price: toNumber(expense.price),
            category: getExpenseCategoryLabel(expense),
          })
        )
      ),
    [ledger.expenses]
  );

  // What confirming would actually write: rows with a category resolved,
  // duplicates and already-known rows dropped, and the categories that have to
  // be created first.
  const importPlan = useMemo(() => {
    if (!importPreview) return null;
    const fallback =
      ledger.categories.find(
        (category) => String(category.id) === importCategoryId
      ) ?? null;
    const named = importPreview.rows
      .map((row) => ({ ...row, name: row.category || fallback?.category || "" }))
      .filter((row) => row.name);

    const seen = new Set<string>();
    const rows = named.filter((row) => {
      const key = expenseKey({ ...row, category: row.name });
      if (existingKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const dates = rows.map((row) => row.date).sort();
    const tagNames = new Map<string, string>();
    rows.forEach((row) => {
      if (row.tag && !findTagByName(ledger.tags, row.tag)) {
        tagNames.set(row.tag.toLowerCase(), row.tag);
      }
    });
    return {
      rows,
      duplicates: named.length - rows.length,
      missing: importPreview.categories.filter(
        (name) => !categoryIdByName.has(name.toLowerCase())
      ),
      missingTags: [...tagNames.values()],
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
    };
  }, [
    categoryIdByName,
    existingKeys,
    importCategoryId,
    importPreview,
    ledger.categories,
    ledger.tags,
  ]);

  // Only asked for when the file left a category blank; until it is answered
  // those rows are excluded from the plan rather than guessed at.
  const needsFallback = Boolean(
    importPreview?.rows.some((row) => !row.category)
  );

  async function handleImportFile(file: File) {
    setImportName(file.name);
    setImportPreview(parseExpenseCsv(await file.text()));
  }

  function cancelImport() {
    setImportPreview(null);
    setImportName("");
    setImportCategoryId("");
    // Without this the same file cannot be picked twice in a row: the input
    // fires no change event when the value is unchanged.
    if (importFile.current) importFile.current.value = "";
  }

  async function handleConfirmImport() {
    if (!importPreview || !importPlan?.rows.length) return;
    setImporting(true);
    setStatus(null);

    const ids = new Map(categoryIdByName);
    for (const name of importPlan.missing) {
      const { data, error } = await supabase
        .from("category")
        .insert({
          category: name,
          kind: guessKind(importPreview.rows, name, importPreview.signed),
          user_id: ledger.userId,
        })
        .select("id");
      if (error || !data?.length) {
        setStatus(error?.message ?? `Kunne ikke opprette kategorien ${name}.`);
        setImporting(false);
        return;
      }
      ids.set(name.trim().toLowerCase(), data[0].id);
    }

    const tagIds = new Map(ledger.tags.map((tag) => [tag.name.trim().toLowerCase(), tag.id]));
    for (const name of importPlan.missingTags) {
      try {
        tagIds.set(name.trim().toLowerCase(), (await ledger.createTag(name)).id);
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : `Kunne ikke opprette merkelappen ${name}.`);
        setImporting(false);
        return;
      }
    }

    // Encrypted at the call site, like every other write on this page.
    const payload = await Promise.all(
      importPlan.rows.map(async (row) => ({
        item: await encField(row.item),
        price: await encField(row.price),
        category_id: ids.get(row.name.trim().toLowerCase()) as number,
        tag_id: row.tag ? tagIds.get(row.tag.trim().toLowerCase()) ?? null : null,
        user_id: ledger.userId,
        date: row.date,
      }))
    );

    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from("expense")
        .insert(payload.slice(i, i + 200));
      if (error) {
        setStatus(error.message);
        setImporting(false);
        // Some chunks may already be in; reload so the table tells the truth.
        await ledger.refetch();
        return;
      }
    }

    const count = payload.length;
    await ledger.refetch();
    cancelImport();
    setImportOpen(false);
    setImporting(false);
    showToast({
      message:
        count === 1
          ? "1 transaksjon importert."
          : `${count} transaksjoner importert.`,
      tone: "info",
    });
  }

  const importPanel = (
    <div className="import">
      <div className="import-head">
        <strong>Importer fra CSV</strong>
        <span className="helper">
          Trenger kolonnene dato, beskrivelse og beløp; kategori og merkelapp
          brukes hvis filen har dem, og en ukjent merkelapp opprettes uten datoer. Semikolon, komma og tab fungerer alle, og
          en fil eksportert herfra leses rett inn igjen.
        </span>
      </div>
      <input
        ref={importFile}
        className="import-file"
        type="file"
        accept=".csv,text/csv,text/plain"
        aria-label="Velg CSV-fil"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleImportFile(file);
        }}
      />

      {importPreview && importPlan ? (
        <div className="import-preview">
          <div className="card-head">
            <strong>{importName}</strong>
            <span className="helper">
              {importPreview.rows.length} rader lest
            </span>
          </div>

          {importPlan.rows.length ? (
            <div className="stat-row">
              <div className="stat stat-small">
                <span className="stat-label">Importeres</span>
                <strong className="stat-value">{importPlan.rows.length}</strong>
              </div>
              {importPlan.from ? (
                <div className="stat stat-small">
                  <span className="stat-label">Periode</span>
                  <strong className="stat-value">
                    {formatDate(importPlan.from)} –{" "}
                    {formatDate(importPlan.to as string)}
                  </strong>
                </div>
              ) : null}
              {importPlan.duplicates ? (
                <div className="stat stat-small">
                  <span className="stat-label">Finnes allerede</span>
                  <strong className="stat-value">
                    {importPlan.duplicates}
                  </strong>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty">
              {needsFallback && !importCategoryId
                ? "Velg en kategori for radene under, så er filen klar."
                : "Ingen nye rader i denne filen."}
            </div>
          )}

          {needsFallback ? (
            <div className="field">
              <label htmlFor="import-fallback-category">
                Kategori for rader uten kategori
              </label>
              <select
                id="import-fallback-category"
                value={importCategoryId}
                onChange={(event) => setImportCategoryId(event.target.value)}
              >
                <option value="">Velg kategori...</option>
                {ledger.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {importPlan.missing.length ? (
            <p className="helper">
              Nye kategorier som opprettes:{" "}
              {importPlan.missing
                .map(
                  (name) =>
                    `${name} (${
                      guessKind(
                        importPreview.rows,
                        name,
                        importPreview.signed
                      ) === "income"
                        ? "inntekt"
                        : "variabel"
                    })`
                )
                .join(", ")}
            </p>
          ) : null}

          {importPlan.missingTags.length ? (
            <p className="helper">
              Nye merkelapper som opprettes, uten datoer:{" "}
              {importPlan.missingTags.join(", ")}
            </p>
          ) : null}

          {importPreview.errors.length ? (
            <details className="import-errors">
              <summary>
                {importPreview.errors.length === 1
                  ? "1 rad ble hoppet over"
                  : `${importPreview.errors.length} rader ble hoppet over`}
              </summary>
              <ul>
                {importPreview.errors.slice(0, 50).map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
                {importPreview.errors.length > 50 ? (
                  <li className="helper">
                    ... og {importPreview.errors.length - 50} flere.
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}

          <div className="form-actions">
            <button
              className="btn btn-primary btn-small"
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || !importPlan.rows.length}
            >
              {importing
                ? "Importerer..."
                : `Importer ${importPlan.rows.length} transaksjoner`}
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={cancelImport}
              disabled={importing}
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  useEffect(() => {
    if (!activityFilters.tag) return;
    if (activityTagOptions.some((option) => option.value === activityFilters.tag)) return;
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
        // The search box only exists while the filter row is open.
        setFiltersOpen(true);
        requestAnimationFrame(() =>
          document.getElementById("activity-item-query")?.focus()
        );
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
        tag_id: expense.tag_id,
        user_id: ledger.userId,
        date: expense.date,
        recurring_id: expense.recurring_id,
      })
      .select(
        "id, item, price, category_id, tag_id, user_id, date, recurring_id, category(id, category, kind)"
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
        // decrypting it: these values are the ones just sent.
        item: expense.item,
        price: toNumber(expense.price),
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
    setActivityFilters(NO_FILTERS);
  }

  function handleStartEdit(expense: Expense) {
    setEditingExpenseId(expense.id);
    setEditDraft({
      item: expense.item,
      price: String(toNumber(expense.price)),
      categoryId: String(expense.category_id),
      tag: expense.tag_id != null ? String(expense.tag_id) : "",
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
        tag_id: editDraft.tag ? Number(editDraft.tag) : null,
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
          tag_id: editDraft.tag ? Number(editDraft.tag) : null,
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

  const newRowTag = newRowDraft.tagPicked
    ? newRowDraft.tag
    : String(tagForDate(ledger.tags, newRowDraft.date || getDefaultNewRowDate())?.id ?? "");

  function pickNewRowTag(tag: string) {
    setNewRowDraft((prev) => ({ ...prev, tag, tagPicked: true }));
  }

  async function handleSaveNewRow() {
    const parsed = Number(newRowDraft.price);
    if (!newRowDraft.item.trim() || !newRowDraft.categoryId || !Number.isFinite(parsed) || parsed === 0) return;

    setNewRowSaving(true);
    setStatus(null);

    const item = newRowDraft.item.trim();
    const price = Math.round(Math.abs(parsed));
    const tagId = newRowTag ? Number(newRowTag) : null;

    const payload = {
      item: await encField(item),
      price: await encField(price),
      category_id: Number(newRowDraft.categoryId),
      tag_id: tagId,
      user_id: ledger.userId,
      // Fall back to the default so the date shown in the input is what gets saved.
      date: newRowDraft.date || getDefaultNewRowDate(),
    };

    const { data, error } = await supabase
      .from("expense")
      .insert(payload)
      .select("id, item, price, category_id, tag_id, user_id, date, recurring_id, category(id, category, kind)");

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
        category,
      };
      ledger.upsertExpense(normalized);
      // On a phone the list is a screen or two below the form, so the row
      // appearing there is no confirmation at all.
      showToast({
        message: `La til ${item}, ${formatCurrency(price)}.`,
        tone: "info",
        actionLabel: "Angre",
        onAction: () => handleDelete(normalized as Expense),
      });
      setNewRowDraft({
        item: "",
        price: "",
        categoryId: newRowDraft.categoryId,
        tag: newRowDraft.tag,
        tagPicked: newRowDraft.tagPicked,
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

  const categoriesByUse = useMemo(() => {
    const uses = new Map<number, number>();
    ledger.expenses.forEach((expense) =>
      uses.set(expense.category_id, (uses.get(expense.category_id) ?? 0) + 1)
    );
    return [...ledger.categories].sort(
      (a, b) =>
        (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) ||
        a.category.localeCompare(b.category, "nb")
    );
  }, [ledger.categories, ledger.expenses]);

  function setFilter(key: keyof ActivityFilters, value: string) {
    setActivityFilters((prev) => ({ ...prev, [key]: value }));
  }

  function renderFilterCell(key: ColumnKey) {
    switch (key) {
      case "date":
        return (
          <DateRangePicker
            from={activityFilters.dateFrom}
            to={activityFilters.dateTo}
            onChange={(dateFrom, dateTo) =>
              setActivityFilters((prev) => ({ ...prev, dateFrom, dateTo }))
            }
          />
        );
      case "tag":
        return (
          <select
            aria-label="Merkelapp"
            value={activityFilters.tag}
            onChange={(e) => setFilter("tag", e.target.value)}
          >
            <option value="">Alle merkelapper</option>
            {activityTagOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "item":
        return (
          <input
            id="activity-item-query"
            aria-label="Søk i beskrivelse"
            placeholder="Søk i beskrivelse"
            value={activityFilters.itemQuery}
            onChange={(e) => setFilter("itemQuery", e.target.value)}
          />
        );
      case "amount":
        return (
          <>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="num"
              aria-label="Minste beløp"
              placeholder="Fra"
              value={activityFilters.minAmount}
              onChange={(e) => setFilter("minAmount", e.target.value)}
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="num"
              aria-label="Største beløp"
              placeholder="Til"
              value={activityFilters.maxAmount}
              onChange={(e) => setFilter("maxAmount", e.target.value)}
            />
          </>
        );
      case "category":
        return (
          <select
            aria-label="Kategori"
            value={activityFilters.category}
            onChange={(e) => setFilter("category", e.target.value)}
          >
            <option value="">Alle kategorier</option>
            {activityCategoryOptions.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        );
    }
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
            className={styles["mobile-amount"]}
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            value={newRowDraft.price}
            onChange={(e) =>
              setNewRowDraft((prev) => ({ ...prev, price: e.target.value }))
            }
            placeholder="0 kr"
          />
        );
      case "category":
        // Chips rather than a <select>: one tap instead of open, scroll, tap,
        // and every option visible at once. Most-used first, so the usual
        // two or three sit at the start of the first line.
        return (
          <div
            id={id}
            className={styles["category-chips"]}
            role="radiogroup"
            aria-label="Kategori"
          >
            {categoriesByUse.map((c) => {
              const slot = getCategorySlot(c.category);
              const on = newRowDraft.categoryId === String(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={styles["category-chip"]}
                  style={
                    {
                      "--cat-bg": categoryTint(slot),
                      "--cat-ink": categoryInk(slot),
                      "--cat": categoryColor(slot),
                    } as CSSProperties
                  }
                  onClick={() =>
                    setNewRowDraft((prev) => ({ ...prev, categoryId: String(c.id) }))
                  }
                >
                  {c.category}
                </button>
              );
            })}
          </div>
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
        return <TagSelect id={id} value={newRowTag} onChange={pickNewRowTag} />;
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
          <TagSelect
            key={key}
            className={styles["cell-input"]}
            value={newRowTag}
            onChange={pickNewRowTag}
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
          <TagSelect
            key={key}
            className={styles["cell-input"]}
            value={editDraft.tag}
            onChange={(tag) => setEditDraft((prev) => ({ ...prev, tag }))}
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
            tagPicked: false,
            date: getDefaultNewRowDate(),
          })
          )
        }
      >
        <h2 className="section-title">Ny transaksjon</h2>
        <div className={styles["mobile-new-row-grid"]}>
          {columnOrder.map((key) => (
            <div
              className={`field ${styles["mobile-field"]}`}
              data-col={key}
              key={key}
            >
              <label htmlFor={`mobile-new-${key}`}>{COLUMN_LABELS[key]}</label>
              {renderMobileFieldInput(key)}
            </div>
          ))}
        </div>
        <div className={styles["mobile-new-row-actions"]}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSaveNewRow}
            disabled={newRowSaving || !newRowDraft.item.trim() || !newRowDraft.categoryId || !newRowDraft.price}
          >
            {newRowSaving ? "Lagrer..." : "Legg til"}
          </button>
        </div>
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Aktivitet</h2>
          <div className="toolbar-actions">
            <button
              className={`btn btn-ghost btn-small${filtersOpen ? " is-on" : ""}`}
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              title="Søk og filtrer (/)"
            >
              <IconFilter />
              Filtrer
              {activeFilterCount ? (
                <span className={styles["filter-count"]}>{activeFilterCount}</span>
              ) : null}
            </button>
            <MoreMenu
              label="Flere valg"
              items={[
                {
                  label: importOpen ? "Lukk import" : "Importer CSV",
                  onSelect: () => {
                    if (importOpen) cancelImport();
                    setImportOpen((open) => !open);
                  },
                },
                {
                  label: "Eksporter CSV",
                  onSelect: handleExportCsv,
                  disabled: filteredAndSortedExpenses.length === 0,
                },
                { label: "Endre faste utgifter", href: "/profil/faste-utgifter" },
                { label: "Endre merkelapper", href: "/profil/merkelapper" },
              ]}
            />
          </div>
        </div>
        {status ? <div className="status">{status}</div> : null}
        {importOpen ? importPanel : null}
        {loading ? <div className="helper">Laster transaksjoner...</div> : null}
        {!loading ? (
          <div className={styles["list"]} style={listColumnStyle}>
            <div className={styles["list-header"]} role="row">
              {columnOrder.map((key) => (
                <button
                  key={key}
                  className={`${styles["list-sort"]} ${
                    key === "amount" ? styles["align-end"] : ""
                  } ${activitySort.key === key ? styles["active"] : ""}`}
                  type="button"
                  onClick={() => handleActivitySort(key)}
                  title="Klikk for å sortere"
                >
                  {COLUMN_LABELS[key]}
                  <span className={styles["list-sort-indicator"]}>
                    {getSortIndicator(key)}
                  </span>
                </button>
              ))}
              <span className={`${styles["list-sort"]} ${styles["empty"]}`} aria-hidden="true" />
            </div>
            {filtersOpen ? (
              <div className={styles["filter-row"]} role="search">
                {columnOrder.map((key) => (
                  <div key={key} className={styles["filter-cell"]} data-col={key}>
                    {renderFilterCell(key)}
                  </div>
                ))}
                <span className={styles["filter-reset"]}>
                  {hasActivityFilters ? (
                    <button
                      className="icon-btn"
                      type="button"
                      title="Nullstill filtre"
                      aria-label="Nullstill filtre"
                      onClick={clearActivityFilters}
                    >
                      <IconX />
                    </button>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div
              className={`${styles["list-row"]} ${styles["new-row"]}`}
              onKeyDown={(e) =>
                handleSpreadsheetKeyDown(e, handleSaveNewRow, () =>
                  setNewRowDraft({
            item: "",
            price: "",
            categoryId: "",
            tag: "",
            tagPicked: false,
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
            {!hasActivityFilters && (pendingFixed.length || skippedFixed) ? (
              <div className={styles["fixed-head"]}>
                <span className="helper">
                  {pendingFixed.length
                    ? `${pendingFixed.length} ${pendingFixed.length === 1 ? "fast utgift er" : "faste utgifter er"} ikke ført for ${selectedMonthLabel}`
                    : `Alle faste utgifter er ført eller hoppet over for ${selectedMonthLabel}`}
                </span>
                {skippedFixed ? (
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    onClick={() => restoreAll("missing-fixed")}
                  >
                    Vis {skippedFixed} hoppet over
                  </button>
                ) : null}
                {pendingFixed.length > 1 ? (
                  <button
                    className="btn btn-primary btn-small"
                    type="button"
                    onClick={() => bookFixed(pendingFixed)}
                    disabled={bookingFixed}
                  >
                    Før alle {pendingFixed.length}
                  </button>
                ) : null}
              </div>
            ) : null}
            {!hasActivityFilters
              ? pendingFixed.map((template) => {
                  const categoryName =
                    ledger.categories.find((c) => c.id === template.category_id)?.category ??
                    "Ukategorisert";
                  const slot = getCategorySlot(categoryName);
                  return (
                    <div
                      key={`fixed-${template.id}`}
                      className={`${styles["list-row"]} ${styles["fixed-row"]}`}
                      role="row"
                    >
                      {columnOrder.map((key) => {
                        switch (key) {
                          case "date":
                            return (
                              <span key={key} data-col="date">
                                {formatDate(materializationDate(template, single!.year, single!.month))}
                              </span>
                            );
                          case "tag":
                            return <span key={key} data-col="tag" />;
                          case "item":
                            return <strong key={key} data-col="item">{template.item}</strong>;
                          case "amount":
                            return (
                              <strong key={key} data-col="amount" className="num">
                                -{formatCurrency(template.price)}
                              </strong>
                            );
                          case "category":
                            return (
                              <span
                                key={key}
                                data-col="category"
                                className={styles["category-pill"]}
                                style={
                                  {
                                    "--cat-bg": categoryTint(slot),
                                    "--cat-ink": categoryInk(slot),
                                  } as CSSProperties
                                }
                              >
                                {categoryName}
                              </span>
                            );
                        }
                      })}
                      <span className={styles["fixed-actions"]}>
                        <button
                          className="icon-btn icon-btn-confirm"
                          type="button"
                          onClick={() => bookFixed([template])}
                          disabled={bookingFixed}
                          aria-label={`Før ${template.item} for ${selectedMonthLabel}`}
                          title="Før denne måneden"
                        >
                          <IconCheck />
                        </button>
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() =>
                            dismiss("missing-fixed", missingFixedRef(template.id, periodKey))
                          }
                          aria-label={`Hopp over ${template.item} for ${selectedMonthLabel}`}
                          title="Gjelder ikke denne måneden"
                        >
                          <IconX />
                        </button>
                      </span>
                    </div>
                  );
                })
              : null}
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
                        return <span key={key} data-col="date">{formatDate(expense.date)}</span>;
                      case "tag":
                        return <span key={key} data-col="tag">{expense.tag ?? ""}</span>;
                      case "item":
                        return <strong key={key} data-col="item">{expense.item}</strong>;
                      case "amount":
                        return (
                          <strong
                            key={key}
                            data-col="amount"
                            className={`num ${isIncome ? "text-income" : ""}`}
                          >
                            {isIncome ? `+${amount}` : `-${amount}`}
                          </strong>
                        );
                      case "category":
                        return (
                          <span
                            key={key}
                            data-col="category"
                            className={styles["category-pill"]}
                            style={categoryStyle}
                          >
                            {categoryName}
                          </span>
                        );
                    }
                  })}
                  {/* Visible, not only a double-click: a touch screen has no
                      double-click, so on a phone a row could not be edited
                      at all. */}
                  <span className={styles["row-buttons"]}>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => handleStartEdit(expense)}
                      aria-label={`Rediger ${expense.item}`}
                      title="Rediger"
                    >
                      <IconPencil />
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      type="button"
                      onClick={() => handleDelete(expense)}
                      disabled={deletingId === expense.id}
                      aria-label={`Slett ${expense.item}`}
                      title="Slett"
                    >
                      <IconTrash />
                    </button>
                  </span>
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
