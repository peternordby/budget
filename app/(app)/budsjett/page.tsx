"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLedger, useLedgerSelection } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { supabase } from "@/lib/supabaseClient";
import { getCategoryHue } from "@/lib/categoryColor";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { formatCurrency, monthLabel, monthName, toNumber } from "@/lib/format";
import { monthKey, type MonthRef } from "@/lib/insights";
import {
  CATEGORY_KINDS,
  KIND_LABELS,
  isIncomeKind,
  isSpendingKind,
  type CategoryKind,
} from "@/lib/categories";
import styles from "./budsjett.module.css";

// Rows are grouped by kind and then sorted by name — deliberately *not* by
// amount. This is an editing surface: a row that jumps to a new position the
// moment you type a bigger number is unusable.
const KIND_ORDER: CategoryKind[] = ["income", "fixed", "variable", "savings"];

function previousPeriod(year: number, month: number): MonthRef {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export default function BudsjettPage() {
  const ledger = useLedger();
  const fallback = useMemo<MonthRef>(
    () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    []
  );
  const { selectedKeys, single } = usePeriod(fallback);
  const expenses = useLedgerSelection(selectedKeys);

  // Drafts are keyed by category id and hold the raw input string, so an
  // empty field stays distinguishable from a 0 the user actually typed.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("variable");
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const periodKey = single ? monthKey(single.year, single.month) : "";

  // A draft belongs to the month it was typed in. Switching months has to
  // clear them, or February's numbers would be saved onto March.
  useEffect(() => {
    setDrafts({});
    setStatus(null);
  }, [periodKey]);

  const spentByCategoryId = useMemo(() => {
    const map = new Map<number, number>();
    expenses.forEach((expense) => {
      const id = expense.category_id;
      if (id == null) return;
      map.set(id, (map.get(id) ?? 0) + toNumber(expense.price));
    });
    return map;
  }, [expenses]);

  const budgetByCategoryId = useMemo(() => {
    const map = new Map<number, number>();
    if (!single) return map;
    ledger.budgets.forEach((entry) => {
      if (entry.year !== single.year || entry.month !== single.month) return;
      map.set(entry.category_id, entry.budget);
    });
    return map;
  }, [ledger.budgets, single]);

  // Which categories can never be deleted, because something still points at
  // them. `category.id` is referenced by expense, budget and recurring_expense
  // with no cascade, so the delete would fail at the database anyway — this
  // just says so before the click instead of after it.
  const usedCategoryIds = useMemo(() => {
    const used = new Set<number>();
    ledger.expenses.forEach((expense) => {
      if (expense.category_id != null) used.add(expense.category_id);
    });
    ledger.budgets.forEach((entry) => used.add(entry.category_id));
    ledger.templates.forEach((template) => used.add(template.category_id));
    return used;
  }, [ledger.expenses, ledger.budgets, ledger.templates]);

  const rows = useMemo(() => {
    return ledger.categories
      .map((category) => ({
        id: category.id,
        name: category.category,
        kind: category.kind,
        spent: spentByCategoryId.get(category.id) ?? 0,
        budget: budgetByCategoryId.get(category.id) ?? 0,
      }))
      .sort((a, b) => {
        const kindDelta = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
        if (kindDelta !== 0) return kindDelta;
        return a.name.localeCompare(b.name, "nb");
      });
  }, [ledger.categories, spentByCategoryId, budgetByCategoryId]);

  function draftValue(row: { id: number; budget: number }) {
    const draft = drafts[row.id];
    if (draft !== undefined) return draft;
    return row.budget > 0 ? String(row.budget) : "";
  }

  // A blank field and a 0 mean the same thing — no budget — because every
  // reader in the app tests `budget > 0`. Storing a 0 row would claim
  // "budgeted nothing" where the truth is "not budgeted".
  function parseDraft(value: string) {
    const parsed = Number(value.trim());
    if (!value.trim() || !Number.isFinite(parsed)) return 0;
    return Math.max(Math.round(parsed), 0);
  }

  const dirtyRows = useMemo(
    () =>
      rows.filter((row) => {
        const draft = drafts[row.id];
        if (draft === undefined) return false;
        return parseDraft(draft) !== row.budget;
      }),
    [rows, drafts]
  );

  const totals = useMemo(() => {
    let budgetTotal = 0;
    let spentTotal = 0;
    rows.forEach((row) => {
      if (!isSpendingKind(row.kind)) return;
      budgetTotal += parseDraft(draftValue(row));
      spentTotal += row.spent;
    });
    return { budgetTotal, spentTotal, remaining: budgetTotal - spentTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, drafts]);

  async function handleSave() {
    if (!single || !dirtyRows.length) return;
    setSaving(true);
    setStatus(null);

    const keep = dirtyRows.filter((row) => parseDraft(drafts[row.id]) > 0);
    const clear = dirtyRows.filter((row) => parseDraft(drafts[row.id]) === 0);

    let error = null;

    if (keep.length) {
      // One upsert for every changed row. The unique index from
      // 0006_budget_owner.sql is what makes this a single statement instead of
      // the find-then-update-or-insert this page used to do per category.
      const result = await supabase.from("budget").upsert(
        keep.map((row) => ({
          category_id: row.id,
          budget: parseDraft(drafts[row.id]),
          year: single.year,
          month: single.month,
          user_id: ledger.userId,
        })),
        { onConflict: "user_id,category_id,year,month" }
      );
      error = result.error;
    }

    if (!error && clear.length) {
      const result = await supabase
        .from("budget")
        .delete()
        .eq("user_id", ledger.userId)
        .eq("year", single.year)
        .eq("month", single.month)
        .in(
          "category_id",
          clear.map((row) => row.id)
        );
      error = result.error;
    }

    if (error) {
      setStatus(error.message);
    } else {
      await ledger.refetch();
      setDrafts({});
    }
    setSaving(false);
  }

  async function handleCopyPrevious() {
    if (!single) return;
    const previous = previousPeriod(single.year, single.month);
    setCopying(true);
    setStatus(null);

    const next: Record<number, string> = {};
    ledger.budgets.forEach((entry) => {
      if (entry.year !== previous.year || entry.month !== previous.month) return;
      next[entry.category_id] = String(entry.budget);
    });

    // January's previous month is the prior December, which can sit outside
    // the years LedgerProvider fetched. One direct read rather than widening
    // the whole window for a copy button.
    if (!Object.keys(next).length && previous.year !== single.year) {
      const { data, error } = await supabase
        .from("budget")
        .select("category_id, budget")
        .eq("user_id", ledger.userId)
        .eq("year", previous.year)
        .eq("month", previous.month);
      if (error) {
        setStatus(error.message);
        setCopying(false);
        return;
      }
      (data ?? []).forEach((entry) => {
        next[entry.category_id] = String(entry.budget);
      });
    }

    if (!Object.keys(next).length) {
      setStatus(`Fant ingen budsjetter for ${monthLabel(previous.year, previous.month)}.`);
    } else {
      // Categories the previous month had no budget for are cleared, so the
      // copy is a copy rather than a merge with whatever is on screen.
      rows.forEach((row) => {
        if (next[row.id] === undefined) next[row.id] = "";
      });
      setDrafts(next);
    }
    setCopying(false);
  }

  async function handleAddCategory() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setStatus(null);
    const { error } = await supabase
      .from("category")
      .insert({ category: name, kind: newKind, user_id: ledger.userId });
    if (error) {
      setStatus(error.message);
    } else {
      await ledger.refetch();
      setNewName("");
      setNewKind("variable");
    }
    setAdding(false);
  }

  async function handleRename(id: number) {
    const name = renameDraft.trim();
    if (!name) return;
    setStatus(null);
    const { error } = await supabase
      .from("category")
      .update({ category: name })
      .eq("id", id)
      .eq("user_id", ledger.userId);
    if (error) {
      setStatus(error.message);
      return;
    }
    setRenamingId(null);
    await ledger.refetch();
  }

  async function handleDelete(id: number) {
    setStatus(null);
    const { error } = await supabase
      .from("category")
      .delete()
      .eq("id", id)
      .eq("user_id", ledger.userId);
    if (error) {
      setStatus(error.message);
      return;
    }
    setConfirmDeleteId(null);
    await ledger.refetch();
  }

  async function handleChangeKind(id: number, kind: CategoryKind) {
    setStatus(null);
    const { error } = await supabase
      .from("category")
      .update({ kind })
      .eq("id", id)
      .eq("user_id", ledger.userId);
    if (error) {
      setStatus(error.message);
      return;
    }
    await ledger.refetch();
  }

  const previous = single ? previousPeriod(single.year, single.month) : null;

  return (
    <>
      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Budsjett</h2>
          <span className="helper">
            {single ? monthLabel(single.year, single.month) : "Ingen måned valgt"}
          </span>
        </div>

        {!single ? (
          <p className="helper">
            Velg én måned i perioden over for å sette budsjett. Et budsjett
            gjelder én måned om gangen, så et utvalg på flere har ingenting å
            skrive til.
          </p>
        ) : (
          <>
            <div className="toolbar">
              <div className="toolbar-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={handleCopyPrevious}
                  disabled={copying}
                >
                  {copying
                    ? "Henter..."
                    : `Kopier fra ${previous ? monthName(previous.month) : ""}`}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirtyRows.length}
                >
                  {saving
                    ? "Lagrer..."
                    : dirtyRows.length
                      ? `Lagre ${dirtyRows.length} endring${dirtyRows.length === 1 ? "" : "er"}`
                      : "Lagre"}
                </button>
              </div>
            </div>

            {status ? <div className="status">{status}</div> : null}

            <div className={styles["budget-list"]}>
              <div className={styles["budget-header"]}>
                <span>Kategori</span>
                <span>Type</span>
                <span className="num">Budsjett</span>
                <span className="num">Brukt</span>
                <span className="num">Igjen</span>
                <span />
              </div>

              {rows.map((row) => {
                const value = draftValue(row);
                const budgetValue = parseDraft(value);
                const income = isIncomeKind(row.kind);
                const hasBudget = budgetValue > 0;
                const remaining = budgetValue - row.spent;
                const over = hasBudget && remaining < 0;
                const percent = hasBudget
                  ? Math.min((row.spent / budgetValue) * 100, 100)
                  : 0;
                const hue = getCategoryHue(row.name);
                const inUse = usedCategoryIds.has(row.id);
                const isRenaming = renamingId === row.id;
                const isConfirming = confirmDeleteId === row.id;

                return (
                  <div key={row.id} className={styles["budget-row"]}>
                    <div className={styles["budget-name"]}>
                      <span
                        className={styles["budget-dot"]}
                        style={{
                          background: income
                            ? "var(--income)"
                            : `hsl(${hue} var(--dot-s) var(--dot-l))`,
                        }}
                      />
                      {isRenaming ? (
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") handleRename(row.id);
                            if (event.key === "Escape") setRenamingId(null);
                          }}
                          aria-label={`Nytt navn for ${row.name}`}
                          autoFocus
                        />
                      ) : (
                        <strong className={income ? "text-income" : ""}>
                          {row.name}
                        </strong>
                      )}
                    </div>

                    <select
                      className={styles["budget-kind"]}
                      value={row.kind}
                      onChange={(event) =>
                        handleChangeKind(row.id, event.target.value as CategoryKind)
                      }
                      aria-label={`Type for ${row.name}`}
                    >
                      {CATEGORY_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>

                    <input
                      className={`${styles["budget-input"]} num`}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="—"
                      value={value}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      aria-label={`Budsjett for ${row.name}`}
                    />

                    <span className="num">{formatCurrency(row.spent)}</span>

                    <span className={`num ${over ? "text-expense" : hasBudget ? "text-income" : "helper"}`}>
                      {hasBudget ? formatCurrency(remaining) : "—"}
                    </span>

                    <span className={styles["budget-actions"]}>
                      {isRenaming ? (
                        <>
                          <button
                            className="icon-btn icon-btn-confirm"
                            type="button"
                            onClick={() => handleRename(row.id)}
                            aria-label={`Lagre navn for ${row.name}`}
                          >
                            <IconCheck />
                          </button>
                          <button
                            className="icon-btn icon-btn-dismiss"
                            type="button"
                            onClick={() => setRenamingId(null)}
                            aria-label="Avbryt"
                          >
                            <IconX />
                          </button>
                        </>
                      ) : isConfirming ? (
                        <>
                          <button
                            className="icon-btn icon-btn-confirm"
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            aria-label={`Bekreft sletting av ${row.name}`}
                          >
                            <IconCheck />
                          </button>
                          <button
                            className="icon-btn icon-btn-dismiss"
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="Avbryt"
                          >
                            <IconX />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="icon-btn"
                            type="button"
                            onClick={() => {
                              setRenameDraft(row.name);
                              setConfirmDeleteId(null);
                              setRenamingId(row.id);
                            }}
                            aria-label={`Gi nytt navn til ${row.name}`}
                            title="Gi nytt navn"
                          >
                            <IconPencil />
                          </button>
                          <button
                            className="icon-btn icon-btn-danger"
                            type="button"
                            disabled={inUse}
                            onClick={() => {
                              setRenamingId(null);
                              setConfirmDeleteId(row.id);
                            }}
                            aria-label={`Slett ${row.name}`}
                            title={
                              inUse
                                ? "Kan ikke slettes: kategorien er i bruk av transaksjoner, budsjetter eller faste utgifter"
                                : "Slett kategori"
                            }
                          >
                            <IconTrash />
                          </button>
                        </>
                      )}
                    </span>

                    <div
                      className={styles["budget-track"]}
                      style={
                        {
                          "--bar-color": income
                            ? "var(--income)"
                            : hasBudget
                              ? over
                                ? "var(--expense)"
                                : "var(--income)"
                              : `hsl(${hue} var(--bar-s) var(--bar-l))`,
                        } as CSSProperties
                      }
                    >
                      <div
                        className={styles["budget-bar"]}
                        style={{ width: `${hasBudget ? percent : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className={styles["budget-total"]}>
                <span>Sum utgiftskategorier</span>
                <span />
                <span className="num">{formatCurrency(totals.budgetTotal)}</span>
                <span className="num">{formatCurrency(totals.spentTotal)}</span>
                <span
                  className={`num ${totals.remaining < 0 ? "text-expense" : "text-income"}`}
                >
                  {formatCurrency(totals.remaining)}
                </span>
                <span />
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Ny kategori</h2>
        </div>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="new-category-name">navn</label>
            <input
              id="new-category-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddCategory();
              }}
              placeholder="Mat"
            />
          </div>
          <div className="field">
            <label htmlFor="new-category-kind">type</label>
            <select
              id="new-category-kind"
              value={newKind}
              onChange={(event) => setNewKind(event.target.value as CategoryKind)}
            >
              {CATEGORY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleAddCategory}
              disabled={adding || !newName.trim()}
            >
              <IconPlus />
              {adding ? "Legger til..." : "Legg til"}
            </button>
          </div>
        </div>
        <p className="helper">
          Typen bestemmer hvor kategorien teller: inntekt, fast eller variabel
          utgift, eller sparing. Den kan endres per rad over.
        </p>
      </section>
    </>
  );
}
