"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { toCategoryKind, type CategoryKind } from "@/lib/categories";
import {
  addMonths,
  listWindowMonths,
  monthKey,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import type { RecurringTemplate } from "@/lib/recurring";
import { decField, decNumber } from "@/lib/crypto";

export type LedgerCategory = {
  id: number;
  category: string;
  kind: CategoryKind;
};

export type LedgerExpense = {
  id: number;
  item: string;
  price: number;
  category_id: number;
  tag: string | null;
  date: string | null;
  recurring_id: number | null;
  category: LedgerCategory | null;
};

export type LedgerBudget = {
  id: number;
  category_id: number;
  budget: number;
  year: number;
  month: number;
  category: LedgerCategory | null;
};

export type LedgerContextValue = {
  expenses: LedgerExpense[];
  categories: LedgerCategory[];
  budgets: LedgerBudget[];
  templates: RecurringTemplate[];
  /** Every YYYY-MM that has at least one transaction, all time, ascending. */
  availableMonths: string[];
  windowStart: MonthRef;
  windowEnd: MonthRef;
  loading: boolean;
  /** Set when the most recent fetch failed. Consumers must not read an empty
   *  list as "there is nothing" while this is set. */
  error: string | null;
  /** The signed-in user's id. Every route's writes and one-off reads filter
   *  or set `user_id` with this rather than re-deriving it from a session. */
  userId: string;
  refetch: () => Promise<void>;
  ensureMonthCovered: (ref: MonthRef) => void;
  upsertExpense: (expense: LedgerExpense) => void;
  removeExpense: (id: number) => void;
};

const WINDOW_MONTHS = 24;

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function useLedger() {
  const value = useContext(LedgerContext);
  if (!value) {
    throw new Error("useLedger must be used inside a LedgerProvider");
  }
  return value;
}

// The ledger window filtered down to the selected months — the figures both
// /oversikt and /transaksjoner scope everything to. Moved verbatim from
// app/visualize/page.tsx's `expenses` memo so neither route has to duplicate
// it; there it depended on local Set state, here on usePeriod's selectedKeys.
export function useLedgerSelection(selectedKeys: Set<string>): LedgerExpense[] {
  const ledger = useLedger();
  return useMemo(
    () =>
      ledger.expenses.filter(
        (entry) => entry.date && selectedKeys.has(entry.date.slice(0, 7))
      ),
    [ledger.expenses, selectedKeys]
  );
}

// Maps a LedgerExpense row into the LedgerEntry shape insights.ts consumes.
// Module-level (not a hook) so it can be applied to any slice of the
// provider's window, not just the 12-month one useLedgerHistory takes.
export function toLedgerEntries(expenses: LedgerExpense[]): LedgerEntry[] {
  return expenses.map((entry) => {
    const name = entry.category?.category || "Ukategorisert";
    return {
      id: entry.id,
      item: entry.item,
      amount: entry.price,
      category: name,
      kind: entry.category?.kind ?? "variable",
      date: entry.date as string,
      tag: entry.tag ?? null,
    };
  });
}

// detectAnomalies has no internal windowing — it treats these entries as the
// complete history for its averages and "first seen" checks, and Anomalies.tsx
// tells the user they cover the last 12 months. The provider's window is
// deliberately wider (24+ months) so chart navigation is instant, so slice back
// to twelve here rather than feeding the whole window through.
export function useLedgerHistory(anchor: MonthRef): LedgerEntry[] {
  const ledger = useLedger();
  return useMemo<LedgerEntry[]>(() => {
    const windowKeys = new Set(
      listWindowMonths(anchor, 12).map((ref) => monthKey(ref.year, ref.month))
    );
    const filtered = ledger.expenses.filter(
      (entry) => entry.date && windowKeys.has(entry.date.slice(0, 7))
    );
    return toLedgerEntries(filtered);
  }, [ledger.expenses, anchor.year, anchor.month]);
}

// The month window the trend views (/innsikt, the category drill-down) compute
// over: the trailing `length` months ending at the *selected* period, not at
// the provider's windowStart/windowEnd. Those bounds are a fetch detail, not a
// user choice — ensureMonthCovered widens them in both directions and never
// narrows them, so one click on next year's budgets would otherwise stretch
// every average and aim the window at months that cannot hold a transaction.
// Clamped to what has actually been fetched at both ends, and both clamps
// matter: the end clamp covers the render right after a month outside the
// window is picked, while ensureMonthCovered widens asynchronously (the same
// transient `covered` documents in app/(app)/transaksjoner/page.tsx), and the
// start clamp stops an anchor deep in the past from reaching back past the
// fetch, where months that were never queried would render as zeroes
// indistinguishable from real ones.
export function useAnalysisWindow(anchor: MonthRef, length: number): MonthRef[] {
  const ledger = useLedger();
  return useMemo(() => {
    // Clamped from above by the anchor and from below by windowStart, so the
    // window can never end outside the fetched range in either direction.
    const end = laterOf(earlierOf(anchor, ledger.windowEnd), ledger.windowStart);
    const start = laterOf(addMonths(end, -(length - 1)), ledger.windowStart);
    return listWindowMonths(end, monthsBetweenInclusive(start, end));
  }, [
    anchor.year,
    anchor.month,
    length,
    ledger.windowStart,
    ledger.windowEnd,
  ]);
}

function normalizeCategory(raw: any): LedgerCategory | null {
  const source = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  if (!source) return null;
  return {
    id: source.id,
    category: source.category,
    kind: toCategoryKind(source.kind),
  };
}

function lastDayOf(ref: MonthRef) {
  return new Date(ref.year, ref.month, 0).getDate();
}

function startOf(ref: MonthRef) {
  return `${ref.year}-${String(ref.month).padStart(2, "0")}-01`;
}

function endOf(ref: MonthRef) {
  const day = String(lastDayOf(ref)).padStart(2, "0");
  return `${ref.year}-${String(ref.month).padStart(2, "0")}-${day}`;
}

function isBefore(a: MonthRef, b: MonthRef) {
  return a.year * 12 + a.month < b.year * 12 + b.month;
}

function isAfter(a: MonthRef, b: MonthRef) {
  return a.year * 12 + a.month > b.year * 12 + b.month;
}

function earlierOf(a: MonthRef, b: MonthRef) {
  return isAfter(a, b) ? b : a;
}

function laterOf(a: MonthRef, b: MonthRef) {
  return isBefore(a, b) ? b : a;
}

function monthsBetweenInclusive(start: MonthRef, end: MonthRef) {
  return end.year * 12 + end.month - (start.year * 12 + start.month) + 1;
}

export default function LedgerProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const userId = session.user.id;
  const today = useMemo<MonthRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, []);

  const [windowStart, setWindowStart] = useState<MonthRef>(() =>
    addMonths(today, -(WINDOW_MONTHS - 1))
  );
  // Widened forward on demand by ensureMonthCovered (e.g. when the UI offers
  // next year's budgets). Initialised to the current month, not a fixed
  // derived value, so it can move.
  const [windowEnd, setWindowEnd] = useState<MonthRef>(() => today);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [budgets, setBudgets] = useState<LedgerBudget[]>([]);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const windowStartKey = monthKey(windowStart.year, windowStart.month);

  const refetch = useCallback(async () => {
    setReloadToken((token) => token + 1);
  }, []);

  const ensureMonthCovered = useCallback(
    (ref: MonthRef) => {
      // Both setters return the identical state object when no widening is
      // needed, so calling this every render (or from an effect with unrelated
      // deps) settles rather than loops.
      setWindowStart((current) => (isBefore(ref, current) ? ref : current));
      setWindowEnd((current) => (isAfter(ref, current) ? ref : current));
    },
    []
  );

  const upsertExpense = useCallback((expense: LedgerExpense) => {
    setExpenses((prev) => {
      const index = prev.findIndex((entry) => entry.id === expense.id);
      if (index === -1) return [expense, ...prev];
      const next = [...prev];
      next[index] = expense;
      return next;
    });
  }, []);

  const removeExpense = useCallback((id: number) => {
    setExpenses((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const start = startOf(windowStart);
      const end = endOf(windowEnd);
      const years: number[] = [];
      for (let year = windowStart.year; year <= windowEnd.year; year += 1) {
        years.push(year);
      }

      const [expenseResult, categoryResult, budgetResult, metaResult, templateResult] =
        await Promise.all([
          supabase
            .from("expense")
            .select(
              "id, item, price, category_id, tag, date, recurring_id, category(id, category, kind)"
            )
            .eq("user_id", userId)
            .gte("date", start)
            .lte("date", end)
            .order("id", { ascending: false }),
          supabase
            .from("category")
            .select("id, category, kind")
            .eq("user_id", userId)
            .order("category", { ascending: true }),
          supabase
            .from("budget")
            .select("id, category_id, budget, year, month, category(id, category, kind)")
            .eq("user_id", userId)
            .in("year", years),
          // Deliberately all-time and deliberately one column: the period
          // picker must offer months older than the window, and deriving them
          // from the window would silently hide older history.
          supabase.from("expense").select("date").eq("user_id", userId),
          supabase
            .from("recurring_expense")
            .select("id, item, price, category_id, tag, day_of_month, active")
            .eq("user_id", userId)
            .order("day_of_month", { ascending: true }),
        ]);

      if (!active) return;

      const failure =
        expenseResult.error ??
        categoryResult.error ??
        budgetResult.error ??
        metaResult.error ??
        templateResult.error;

      if (failure) {
        setError(failure.message);
        setLoading(false);
        return;
      }

      // The one place the ledger is decrypted. Everything downstream — every
      // useMemo, the search box, the CSV export, insights.ts — receives plain
      // numbers and strings and has no idea any of this is encrypted.
      //
      // Decrypting is awaited, which reopens the window a superseded load could
      // land in, so the rows go into locals and `active` is checked once more
      // before any of them reach state.
      const decryptedExpenses = await Promise.all(
        (expenseResult.data ?? []).map(async (row: any) => ({
          id: row.id,
          item: (await decField(row.item)) ?? "",
          price: await decNumber(row.price),
          category_id: row.category_id,
          tag: await decField(row.tag ?? null),
          date: row.date ?? null,
          recurring_id: row.recurring_id ?? null,
          category: normalizeCategory(row.category),
        }))
      );

      const decryptedBudgets = await Promise.all(
        (budgetResult.data ?? []).map(async (row: any) => ({
          id: row.id,
          category_id: row.category_id,
          budget: await decNumber(row.budget),
          year: row.year,
          month: row.month,
          category: normalizeCategory(row.category),
        }))
      );

      const decryptedTemplates = await Promise.all(
        (templateResult.data ?? []).map(async (row: any) => ({
          id: row.id,
          item: (await decField(row.item)) ?? "",
          price: await decNumber(row.price),
          category_id: row.category_id,
          tag: await decField(row.tag ?? null),
          day_of_month: row.day_of_month,
          active: row.active,
        }))
      );

      if (!active) return;

      setExpenses(decryptedExpenses);
      setBudgets(decryptedBudgets);
      setTemplates(decryptedTemplates);

      setCategories(
        (categoryResult.data ?? []).map((row: any) => ({
          id: row.id,
          category: row.category,
          kind: toCategoryKind(row.kind),
        }))
      );

      const months = new Set<string>();
      (metaResult.data ?? []).forEach((row: any) => {
        if (row.date) months.add(String(row.date).slice(0, 7));
      });
      setAvailableMonths(Array.from(months).sort());

      setLoading(false);
    }

    // Nothing inside load() is wrapped, and decField throws on a row it cannot
    // open — one corrupt ciphertext would otherwise leave `loading` true
    // forever: a spinner, no banner, no way to tell it apart from a slow
    // network. decNumber already survives a bad row on purpose; this makes the
    // text columns fail loudly instead of silently.
    load().catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Ukjent feil");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId, windowStartKey, windowEnd.year, windowEnd.month, reloadToken]);

  const value = useMemo<LedgerContextValue>(
    () => ({
      expenses,
      categories,
      budgets,
      templates,
      availableMonths,
      windowStart,
      windowEnd,
      loading,
      error,
      userId,
      refetch,
      ensureMonthCovered,
      upsertExpense,
      removeExpense,
    }),
    [
      expenses,
      categories,
      budgets,
      templates,
      availableMonths,
      windowStart,
      windowEnd,
      loading,
      error,
      userId,
      refetch,
      ensureMonthCovered,
      upsertExpense,
      removeExpense,
    ]
  );

  return (
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  );
}
