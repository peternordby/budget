"use client";

import { useEffect, useMemo, useState } from "react";
import { useLedger, useLedgerSelection } from "@/components/LedgerProvider";
import { usePeriod } from "@/lib/usePeriod";
import { supabase } from "@/lib/supabaseClient";
import { categoryColor, getCategorySlot } from "@/lib/categoryColor";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { BulletBar } from "@/components/charts";
import { formatCurrency, monthLabel, monthName, toNumber } from "@/lib/format";
import { monthKey, type MonthRef } from "@/lib/insights";
import { decNumber, encField } from "@/lib/crypto";
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
  // The previous month's budgets, per category id. Loaded rather than read on
  // click, because the button's label has to state how many it would copy
  // before anyone presses it.
  const [previousBudgets, setPreviousBudgets] = useState<Record<number, number>>({});
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("variable");
  const [adding, setAdding] = useState(false);
  // The row currently open for editing, and its pending kind. Budget edits go
  // into `drafts` like every other pending figure; the kind is held separately
  // because it writes to `category` rather than `budget`, and holding it means
  // the row's cancel button can actually cancel it.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [kindDraft, setKindDraft] = useState<CategoryKind | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const periodKey = single ? monthKey(single.year, single.month) : "";

  // A draft belongs to the month it was typed in. Switching months has to
  // clear them, or February's numbers would be saved onto March.
  useEffect(() => {
    setDrafts({});
    setStatus(null);
  }, [periodKey]);

  useEffect(() => {
    if (!single) {
      setPreviousBudgets({});
      return;
    }
    const previousRef = previousPeriod(single.year, single.month);
    const fromWindow: Record<number, number> = {};
    ledger.budgets.forEach((entry) => {
      if (entry.year !== previousRef.year || entry.month !== previousRef.month) return;
      fromWindow[entry.category_id] = entry.budget;
    });
    if (Object.keys(fromWindow).length) {
      setPreviousBudgets(fromWindow);
      return;
    }

    // LedgerProvider fetches budgets by year, so January's previous December
    // can sit outside what it holds. One direct read rather than widening the
    // whole window for a copy button.
    if (previousRef.year === single.year) {
      setPreviousBudgets({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("budget")
        .select("category_id, budget")
        .eq("user_id", ledger.userId)
        .eq("year", previousRef.year)
        .eq("month", previousRef.month);
      if (cancelled || error) return;
      const loaded: Record<number, number> = {};
      for (const entry of data ?? []) {
        loaded[entry.category_id] = await decNumber(entry.budget);
      }
      if (!cancelled) setPreviousBudgets(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [periodKey, ledger.budgets, ledger.userId, single]);

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

  function isDirty(row: { id: number; budget: number }) {
    const draft = drafts[row.id];
    if (draft === undefined) return false;
    return parseDraft(draft) !== row.budget;
  }

  const dirtyRows = useMemo(
    () => rows.filter(isDirty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, drafts]
  );

  // Rows the previous month budgeted and this one has not — the copy's whole
  // scope. Keyed off the *effective* value (draft or stored), so a figure typed
  // a second ago counts as set and will not be overwritten either.
  const copyable = useMemo(
    () =>
      rows.filter(
        (row) =>
          (previousBudgets[row.id] ?? 0) > 0 && parseDraft(draftValue(row)) === 0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, previousBudgets, drafts]
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

  /**
   * Write the given rows' budgets. Takes the rows explicitly rather than always
   * using `dirtyRows`, so a single row's tick and the toolbar's "Lagre N
   * endringer" are one code path — "Kopier fra …" still fills every row at once
   * and needs the batch.
   */
  async function saveRows(targets: { id: number }[]) {
    if (!single || !targets.length) return;
    setSaving(true);
    setStatus(null);

    const keep = targets.filter((row) => parseDraft(drafts[row.id]) > 0);
    const clear = targets.filter((row) => parseDraft(drafts[row.id]) === 0);

    let error = null;

    if (keep.length) {
      // One upsert for every changed row. The unique index from
      // 0006_budget_owner.sql is what makes this a single statement instead of
      // the find-then-update-or-insert this page used to do per category.
      const result = await supabase.from("budget").upsert(
        await Promise.all(
          keep.map(async (row) => ({
            category_id: row.id,
            budget: await encField(parseDraft(drafts[row.id])),
            year: single.year,
            month: single.month,
            user_id: ledger.userId,
          }))
        ),
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
      // Only the rows just written, so saving one row does not throw away the
      // pending figures a "Kopier fra …" put on all the others.
      setDrafts((current) => {
        const next = { ...current };
        targets.forEach((row) => delete next[row.id]);
        return next;
      });
    }
    setSaving(false);
  }

  function handleSave() {
    return saveRows(dirtyRows);
  }

  /** Commit one row: whichever of its name, kind and budget actually changed. */
  async function commitRow(row: (typeof rows)[number]) {
    const name = (nameDraft ?? row.name).trim();
    // Blanking the name is a mistake, not an instruction: every form in the app
    // needs a category, and a nameless one would render as an empty pill
    // everywhere. Stay in edit mode and say so rather than silently keeping the
    // old name, which looks like the save was ignored.
    if (!name) {
      setStatus("Kategorien må ha et navn.");
      return;
    }

    const patch: { category?: string; kind?: CategoryKind } = {};
    if (name !== row.name) patch.category = name;
    if (kindDraft && kindDraft !== row.kind) patch.kind = kindDraft;
    const wrotePatch = Object.keys(patch).length > 0;

    if (wrotePatch && !(await writeCategory(row.id, patch))) return;

    if (isDirty(row)) {
      // saveRows refetches, so it covers the patch above too.
      await saveRows([row]);
    } else if (wrotePatch) {
      await ledger.refetch();
    }
    closeRow(row);
  }

  function cancelRow(row: { id: number }) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    closeRow(row);
  }

  function closeRow(_row: { id: number }) {
    setEditingId(null);
    setNameDraft(null);
    setKindDraft(null);
  }

  /**
   * Fill the *empty* budget cells from last month, and only those.
   *
   * It used to be a replace: every row the previous month had no budget for was
   * cleared, "so the copy is a copy rather than a merge with whatever is on
   * screen". That makes it destructive on the common use — most of the month is
   * already budgeted and you want the two rows you forgot — so it fills gaps
   * now, and the button's label says how many gaps it is filling.
   */
  function handleCopyPrevious() {
    setStatus(null);
    setDrafts((current) => {
      const next = { ...current };
      copyable.forEach((row) => {
        next[row.id] = String(previousBudgets[row.id]);
      });
      return next;
    });
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

  /**
   * The category row's own columns, in one update — the name and the kind both
   * live on `category`, so editing both is one statement rather than two.
   *
   * No refetch of its own: commitRow may also be writing a budget, and two
   * sequential refetches of the whole ledger for one row's edit is a waste.
   */
  async function writeCategory(
    id: number,
    patch: { category?: string; kind?: CategoryKind }
  ) {
    setStatus(null);
    const { error } = await supabase
      .from("category")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ledger.userId);
    if (error) {
      setStatus(error.message);
      return false;
    }
    return true;
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
                {/* Gone entirely when every category the previous month
                    budgeted is already set here: a button that would do nothing
                    is worse than no button, since pressing it looks broken. */}
                {copyable.length ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={handleCopyPrevious}
                  >
                    {`Kopier ${copyable.length} fra ${previous ? monthName(previous.month) : ""}`}
                  </button>
                ) : null}
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
                <span className="num">Faktisk</span>
                <span className="num">Diff</span>
                <span />
              </div>

              {rows.map((row) => {
                const value = draftValue(row);
                const budgetValue = parseDraft(value);
                const income = isIncomeKind(row.kind);
                const hasBudget = budgetValue > 0;
                // Above the budget, as a fact — used for the bar's scale and
                // its marker, in both directions.
                const exceeded = hasBudget && row.spent > budgetValue;
                // The signed variance, oriented so positive is always the good
                // direction. For spending that is budget − faktisk (what is
                // left); for income it is the other way round, because earning
                // 2 129 kr more than planned is a surplus, not an overrun.
                const diff = income
                  ? row.spent - budgetValue
                  : budgetValue - row.spent;
                const short = hasBudget && diff < 0;
                // Same scaling rule as /oversikt's rows, via the same
                // <BulletBar>: under budget the track is the budget, over it
                // the track is the spend and the budget is marked inside.
                const barScale = !hasBudget ? 0 : exceeded ? row.spent : budgetValue;
                const catColor = categoryColor(getCategorySlot(row.name));
                const inUse = usedCategoryIds.has(row.id);
                const isEditing = editingId === row.id;
                const isConfirming = confirmDeleteId === row.id;

                return (
                  <div key={row.id} className={styles["budget-row"]}>
                    <div className={styles["budget-name"]}>
                      <span
                        className={styles["budget-dot"]}
                        style={{
                          background: income
                            ? "var(--income)"
                            : catColor,
                        }}
                      />
                      {isEditing ? (
                        <input
                          className={styles["budget-name-input"]}
                          value={nameDraft ?? row.name}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRow(row);
                            if (event.key === "Escape") cancelRow(row);
                          }}
                          aria-label={`Navn på ${row.name}`}
                          autoFocus
                        />
                      ) : (
                        <strong className={income ? "text-income" : ""}>
                          {row.name}
                        </strong>
                      )}
                    </div>

                    {isEditing ? (
                      <select
                        className={styles["budget-kind"]}
                        value={kindDraft ?? row.kind}
                        onChange={(event) =>
                          setKindDraft(event.target.value as CategoryKind)
                        }
                        aria-label={`Type for ${row.name}`}
                      >
                        {CATEGORY_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles["budget-kind-text"]}>
                        {KIND_LABELS[row.kind]}
                      </span>
                    )}

                    {isEditing ? (
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
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRow(row);
                          if (event.key === "Escape") cancelRow(row);
                        }}
                        aria-label={`Budsjett for ${row.name}`}
                      />
                    ) : (
                      // The draft rather than the stored value, so what
                      // "Kopier fra …" put on the row is visible before it is
                      // saved — flagged as pending, or an unsaved figure would
                      // be indistinguishable from a committed one.
                      <span
                        className={`num ${isDirty(row) ? styles["budget-pending"] : ""}`}
                      >
                        {hasBudget ? formatCurrency(budgetValue) : "—"}
                      </span>
                    )}

                    <span className="num">{formatCurrency(row.spent)}</span>

                    <span className={`num ${short ? "text-expense" : hasBudget ? "text-income" : "helper"}`}>
                      {hasBudget ? formatCurrency(diff) : "—"}
                    </span>

                    <span className={styles["budget-actions"]}>
                      {isEditing ? (
                        <>
                          <button
                            className="icon-btn icon-btn-confirm"
                            type="button"
                            onClick={() => commitRow(row)}
                            disabled={saving}
                            aria-label={`Lagre ${row.name}`}
                          >
                            <IconCheck />
                          </button>
                          <button
                            className="icon-btn icon-btn-dismiss"
                            type="button"
                            onClick={() => cancelRow(row)}
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
                              setConfirmDeleteId(null);
                              setNameDraft(row.name);
                              setKindDraft(row.kind);
                              setEditingId(row.id);
                            }}
                            aria-label={`Endre ${row.name}`}
                            title="Endre navn, type og budsjett"
                          >
                            <IconPencil />
                          </button>
                          <button
                            className="icon-btn icon-btn-danger"
                            type="button"
                            disabled={inUse}
                            onClick={() => {
                              closeRow(row);
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

                    <div className={styles["budget-track"]}>
                      <BulletBar
                        fraction={barScale > 0 ? row.spent / barScale : 0}
                        color={
                          income
                            ? "var(--income)"
                            : hasBudget
                              ? exceeded
                                ? "var(--expense)"
                                : "var(--income)"
                              : catColor
                        }
                        markerFraction={
                          exceeded && barScale > 0 ? budgetValue / barScale : undefined
                        }
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
