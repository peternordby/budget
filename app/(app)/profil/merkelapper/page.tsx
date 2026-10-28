"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLedger } from "@/components/LedgerProvider";
import { supabase } from "@/lib/supabaseClient";
import { encField } from "@/lib/crypto";
import { formatCurrency } from "@/lib/format";
import { keyToRef } from "@/lib/period";
import { shortDate } from "@/lib/periodStats";
import { daySpan, type Tag } from "@/lib/tags";
import { IconCheck, IconChevronLeft, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import styles from "./merkelapper.module.css";

type Draft = { name: string; start: string; end: string; budget: string };

function dateRange(start: string, end: string) {
  const withYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${shortDate(start, withYear)} – ${shortDate(end, true)}`;
}

/**
 * Merkelapper — trips and projects: name, dates, budget. The dates are what
 * "per dag" on /innsikt divides by and what preselects a merkelapp for a new
 * expense; a merkelapp without them still totals, it just has no days.
 *
 * `name` and `budget` are encrypted like every other description and amount;
 * the dates are readable, as `expense.date` is.
 */
export default function MerkelapperPage() {
  const ledger = useLedger();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", start: "", end: "", budget: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Usage counts and first/last purchase need every expense, not the window.
  const firstMonth = ledger.availableMonths[0];
  const { ensureMonthCovered } = ledger;
  useEffect(() => {
    if (firstMonth) ensureMonthCovered(keyToRef(firstMonth));
  }, [firstMonth, ensureMonthCovered]);

  const usage = useMemo(() => {
    const byTag = new Map<number, { count: number; first: string; last: string }>();
    ledger.expenses.forEach((expense) => {
      if (expense.tag_id == null || !expense.date) return;
      const seen = byTag.get(expense.tag_id);
      byTag.set(expense.tag_id, {
        count: (seen?.count ?? 0) + 1,
        first: seen && seen.first < expense.date ? seen.first : expense.date,
        last: seen && seen.last > expense.date ? seen.last : expense.date,
      });
    });
    return byTag;
  }, [ledger.expenses]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setStatus(null);
    try {
      await ledger.createTag(name);
      setNewName("");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Kunne ikke opprette merkelappen.");
    }
    setBusy(false);
  }

  function startEdit(tag: Tag) {
    setConfirmDeleteId(null);
    setStatus(null);
    setDraft({
      name: tag.name,
      start: tag.start ?? "",
      end: tag.end ?? "",
      budget: tag.budget != null ? String(tag.budget) : "",
    });
    setEditingId(tag.id);
  }

  async function handleSave(id: number) {
    const name = draft.name.trim();
    const budget = draft.budget.trim() ? Math.round(Number(draft.budget)) : null;
    // Names may repeat ("Hytta" every summer); the dates tell them apart.
    const problem = !name
      ? "Merkelappen må ha et navn."
      : Boolean(draft.start) !== Boolean(draft.end)
          ? "Sett både første og siste dag, eller ingen av dem."
          : draft.start && draft.end < draft.start
            ? "Siste dag kan ikke være før første."
            : budget != null && (!Number.isFinite(budget) || budget < 0)
              ? "Budsjettet må være et beløp på 0 kr eller mer."
              : null;
    if (problem) {
      setStatus(problem);
      return;
    }

    setBusy(true);
    setStatus(null);
    const tag: Tag = { id, name, start: draft.start || null, end: draft.end || null, budget };
    const { error } = await supabase
      .from("tag")
      .update({
        name: await encField(name),
        start_date: tag.start,
        end_date: tag.end,
        budget: await encField(budget),
      })
      .eq("id", id)
      .eq("user_id", ledger.userId);
    if (error) setStatus(error.message);
    else {
      ledger.upsertTag(tag);
      setEditingId(null);
    }
    setBusy(false);
  }

  async function handleDelete(id: number) {
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.from("tag").delete().eq("id", id).eq("user_id", ledger.userId);
    if (error) setStatus(error.message);
    else {
      ledger.removeTag(id);
      setConfirmDeleteId(null);
    }
    setBusy(false);
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
          <h2 className="section-title">Merkelapper</h2>
          <span className="helper">{ledger.tags.length} merkelapper</span>
        </div>
        <p className={`helper ${styles["lede"]}`}>
          En merkelapp samler en tur eller et prosjekt. Med første og siste dag
          satt regnes kostnaden per dag over dagene du var borte, også med
          billetter kjøpt på forhånd, og nye utgifter i de dagene får
          merkelappen forhåndsvalgt.
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
            placeholder="Ny merkelapp"
            aria-label="Navn på ny merkelapp"
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
            <IconPlus />
            Legg til
          </button>
        </form>

        {ledger.tags.length === 0 ? (
          <div className="empty">Ingen merkelapper ennå.</div>
        ) : null}

        {ledger.tags.map((tag) => {
          const used = usage.get(tag.id);
          const editing = editingId === tag.id;
          const confirming = confirmDeleteId === tag.id;
          return (
            <div key={tag.id} className={styles["row"]}>
              {editing ? (
                <div className={styles["edit"]}>
                  <div className="field">
                    <label htmlFor={`tag-name-${tag.id}`}>Navn</label>
                    <input
                      id={`tag-name-${tag.id}`}
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`tag-start-${tag.id}`}>Første dag</label>
                    <input
                      id={`tag-start-${tag.id}`}
                      type="date"
                      value={draft.start}
                      onChange={(event) => setDraft((prev) => ({ ...prev, start: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`tag-end-${tag.id}`}>Siste dag</label>
                    <input
                      id={`tag-end-${tag.id}`}
                      type="date"
                      value={draft.end}
                      min={draft.start || undefined}
                      onChange={(event) => setDraft((prev) => ({ ...prev, end: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`tag-budget-${tag.id}`}>Budsjett</label>
                    <input
                      id={`tag-budget-${tag.id}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      className="num"
                      value={draft.budget}
                      onChange={(event) => setDraft((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="Valgfritt"
                    />
                  </div>
                  {used ? (
                    <p className={`helper ${styles["hint"]}`}>
                      Første kjøp {shortDate(used.first, true)} · siste kjøp{" "}
                      {shortDate(used.last, true)}{" "}
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, start: used.first, end: used.last }))}
                      >
                        Bruk disse
                      </button>
                    </p>
                  ) : null}
                  <div className={styles["edit-actions"]}>
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, start: "", end: "" }))}
                      disabled={!draft.start && !draft.end}
                    >
                      Fjern datoer
                    </button>
                    <button
                      className="icon-btn icon-btn-confirm"
                      type="button"
                      onClick={() => handleSave(tag.id)}
                      disabled={busy}
                      aria-label={`Lagre ${tag.name}`}
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
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles["row-main"]}>
                    <strong className={styles["row-name"]}>{tag.name}</strong>
                    <span className="helper">
                      {tag.start && tag.end
                        ? `${dateRange(tag.start, tag.end)} · ${daySpan(tag.start, tag.end)} dager`
                        : "Uten datoer"}
                      {tag.budget != null ? ` · budsjett ${formatCurrency(tag.budget)}` : ""}
                      {` · ${used ? `${used.count} utgifter` : "Ikke i bruk"}`}
                    </span>
                    {confirming && used ? (
                      <span className="helper">
                        {used.count === 1
                          ? "1 utgift mister merkelappen. Selve utgiften beholdes."
                          : `${used.count} utgifter mister merkelappen. Selve utgiftene beholdes.`}
                      </span>
                    ) : null}
                  </div>
                  <span className={styles["row-actions"]}>
                    {confirming ? (
                      <>
                        <button
                          className="icon-btn icon-btn-confirm"
                          type="button"
                          onClick={() => handleDelete(tag.id)}
                          disabled={busy}
                          aria-label={`Bekreft sletting av ${tag.name}`}
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
                          onClick={() => startEdit(tag)}
                          aria-label={`Endre ${tag.name}`}
                          title="Endre navn, datoer og budsjett"
                        >
                          <IconPencil />
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setConfirmDeleteId(tag.id);
                          }}
                          aria-label={`Slett ${tag.name}`}
                          title="Slett merkelapp"
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
