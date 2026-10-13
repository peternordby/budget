"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLedger } from "@/components/LedgerProvider";
import { supabase } from "@/lib/supabaseClient";
import { categoryColor, getCategorySlot } from "@/lib/categoryColor";
import { IconCheck, IconChevronLeft, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { CATEGORY_KINDS, KIND_LABELS, type CategoryKind } from "@/lib/categories";
import styles from "./kategorier.module.css";

/**
 * Category settings: name, kind, add, delete. Lived on /budsjett until it
 * became clear that renaming a category is not budgeting — it is setup you do
 * once, so it sits under the profile with the rest of the settings, and
 * /budsjett links here.
 *
 * `category` is not encrypted (it is what RLS and every join group by), so
 * these writes need no encField.
 */
export default function KategorierPage() {
  const ledger = useLedger();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("variable");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [kindDraft, setKindDraft] = useState<CategoryKind>("variable");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // How many things point at each category. `category.id` is referenced by
  // expense, budget and recurring_expense with no cascade, so deleting one in
  // use fails at the database anyway — this says so before the click. Counts
  // only what the provider has fetched, so it is a floor, not an exact figure.
  const usage = useMemo(() => {
    const counts = new Map<number, number>();
    const bump = (id: number | null) => {
      if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
    };
    ledger.expenses.forEach((expense) => bump(expense.category_id));
    ledger.budgets.forEach((entry) => bump(entry.category_id));
    ledger.templates.forEach((template) => bump(template.category_id));
    return counts;
  }, [ledger.expenses, ledger.budgets, ledger.templates]);

  const groups = useMemo(
    () =>
      CATEGORY_KINDS.map((kind) => ({
        kind,
        rows: ledger.categories
          .filter((category) => category.kind === kind)
          .sort((a, b) => a.category.localeCompare(b.category, "nb")),
      })).filter((group) => group.rows.length),
    [ledger.categories]
  );

  async function run(write: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setStatus(null);
    const { error } = await write();
    if (error) setStatus(error.message);
    else await ledger.refetch();
    setBusy(false);
    return !error;
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    if (ledger.categories.some((c) => c.category.toLowerCase() === name.toLowerCase())) {
      setStatus(`Kategorien «${name}» finnes allerede.`);
      return;
    }
    const ok = await run(() =>
      supabase.from("category").insert({ category: name, kind: newKind, user_id: ledger.userId })
    );
    if (ok) setNewName("");
  }

  async function handleSave(id: number) {
    const name = nameDraft.trim();
    // A blanked name is a mistake, not an instruction: a nameless category
    // would render as an empty pill everywhere.
    if (!name) {
      setStatus("Kategorien må ha et navn.");
      return;
    }
    const ok = await run(() =>
      supabase
        .from("category")
        .update({ category: name, kind: kindDraft })
        .eq("id", id)
        .eq("user_id", ledger.userId)
    );
    if (ok) setEditingId(null);
  }

  async function handleDelete(id: number) {
    const ok = await run(() =>
      supabase.from("category").delete().eq("id", id).eq("user_id", ledger.userId)
    );
    if (ok) setConfirmDeleteId(null);
  }

  return (
    <>
      <div className={`section-gap ${styles["crumbs"]}`}>
        <Link href="/profil" className="btn btn-ghost btn-small">
          <IconChevronLeft />
          Profil
        </Link>
      </div>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Kategorier</h2>
          <span className="helper">{ledger.categories.length} kategorier</span>
        </div>
        <p className={`helper ${styles["lede"]}`}>
          Typen bestemmer hvor kategorien teller: inntekt, fast eller variabel
          utgift, eller sparing. En kategori som er i bruk kan gis nytt navn,
          men ikke slettes.
        </p>

        {status ? <div className="status">{status}</div> : null}

        <form
          className={styles["add"]}
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Ny kategori"
            aria-label="Navn på ny kategori"
          />
          <select
            value={newKind}
            onChange={(event) => setNewKind(event.target.value as CategoryKind)}
            aria-label="Type"
          >
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
            <IconPlus />
            Legg til
          </button>
        </form>

        {groups.map((group) => (
          <div key={group.kind} className={styles["group"]}>
            <h3 className={styles["group-title"]}>{KIND_LABELS[group.kind]}</h3>
            {group.rows.map((category) => {
              const used = usage.get(category.id) ?? 0;
              const editing = editingId === category.id;
              const confirming = confirmDeleteId === category.id;
              return (
                <div key={category.id} className={styles["row"]}>
                  <span
                    className="breakdown-dot"
                    style={{
                      background:
                        category.kind === "income"
                          ? "var(--income)"
                          : categoryColor(getCategorySlot(category.category)),
                    }}
                  />
                  {editing ? (
                    <>
                      <input
                        className={styles["row-name-input"]}
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSave(category.id);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        aria-label={`Navn på ${category.category}`}
                        autoFocus
                      />
                      <select
                        className={styles["row-kind"]}
                        value={kindDraft}
                        onChange={(event) => setKindDraft(event.target.value as CategoryKind)}
                        aria-label={`Type for ${category.category}`}
                      >
                        {CATEGORY_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <strong className={styles["row-name"]}>{category.category}</strong>
                      <span className={`helper ${styles["row-kind"]}`}>
                        {used ? `${used} i bruk` : "Ikke i bruk"}
                      </span>
                    </>
                  )}
                  <span className={styles["row-actions"]}>
                    {editing ? (
                      <>
                        <button
                          className="icon-btn icon-btn-confirm"
                          type="button"
                          onClick={() => handleSave(category.id)}
                          disabled={busy}
                          aria-label={`Lagre ${category.category}`}
                        >
                          <IconCheck />
                        </button>
                        <button
                          className="icon-btn icon-btn-dismiss"
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Avbryt"
                        >
                          <IconX />
                        </button>
                      </>
                    ) : confirming ? (
                      <>
                        <button
                          className="icon-btn icon-btn-confirm"
                          type="button"
                          onClick={() => handleDelete(category.id)}
                          disabled={busy}
                          aria-label={`Bekreft sletting av ${category.category}`}
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
                            setNameDraft(category.category);
                            setKindDraft(category.kind);
                            setEditingId(category.id);
                          }}
                          aria-label={`Endre ${category.category}`}
                          title="Endre navn og type"
                        >
                          <IconPencil />
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          type="button"
                          disabled={used > 0}
                          onClick={() => {
                            setEditingId(null);
                            setConfirmDeleteId(category.id);
                          }}
                          aria-label={`Slett ${category.category}`}
                          title={
                            used
                              ? "Kan ikke slettes: kategorien er i bruk av transaksjoner, budsjetter eller faste utgifter"
                              : "Slett kategori"
                          }
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </>
  );
}
