"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/format";
import { useLedger } from "@/components/LedgerProvider";
import type { RecurringTemplate } from "@/lib/recurring";
import { IconCheck, IconPlus, IconTrash, IconX } from "@/components/icons";
import { encField } from "@/lib/crypto";
import styles from "./RecurringTemplates.module.css";

const emptyDraft = {
  item: "",
  price: "",
  categoryId: "",
  tag: "",
  dayOfMonth: "1",
};

/**
 * The fixed-expense templates: what repeats every month, on which day. Only
 * the templates live here, on /profil/faste-utgifter — booking them into a
 * month happens in the transaction list itself, where a month's unbooked ones
 * show up as rows to tick or skip.
 */
export default function RecurringTemplates() {
  const ledger = useLedger();
  const userId = ledger.userId;
  const categories = ledger.categories;
  const templates = ledger.templates;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const activeCount = templates.filter((template) => template.active).length;

  async function handleAddTemplate() {
    const parsed = Number(draft.price);
    const day = Number(draft.dayOfMonth);
    if (!draft.item.trim() || !draft.categoryId || !Number.isFinite(parsed)) return;
    if (!Number.isFinite(day) || day < 1 || day > 31) return;

    setBusy(true);
    setStatus(null);

    const { error } = await supabase.from("recurring_expense").insert({
      item: await encField(draft.item.trim()),
      price: await encField(Math.round(Math.abs(parsed))),
      category_id: Number(draft.categoryId),
      tag: await encField(draft.tag.trim() || null),
      day_of_month: day,
      user_id: userId,
    });

    if (error) {
      setStatus(error.message);
    } else {
      setDraft(emptyDraft);
      setAdding(false);
      await ledger.refetch();
    }

    setBusy(false);
  }

  async function handleToggleActive(template: RecurringTemplate) {
    setBusy(true);
    setStatus(null);

    const { error } = await supabase
      .from("recurring_expense")
      .update({ active: !template.active })
      .eq("id", template.id)
      .eq("user_id", userId);

    if (error) {
      setStatus(error.message);
    } else {
      await ledger.refetch();
    }

    setBusy(false);
  }

  // `expense.recurring_id` is declared `on delete set null` (0001), so months
  // already booked from this template keep their transactions — deleting the
  // template stops future generation, it does not rewrite history.
  async function handleDelete(template: RecurringTemplate) {
    setBusy(true);
    setStatus(null);

    const { error } = await supabase
      .from("recurring_expense")
      .delete()
      .eq("id", template.id)
      .eq("user_id", userId);

    if (error) {
      setStatus(error.message);
    } else {
      setConfirmDeleteId(null);
      await ledger.refetch();
    }

    setBusy(false);
  }

  return (
    <section className="card section-gap">
      <div className="card-head">
        <h2 className="section-title">Faste utgifter</h2>
        <span className="helper">{activeCount} aktive</span>
      </div>
      <p className="helper">
        Det som går ut hver måned: husleie, strøm, abonnementer. De dukker opp
        øverst i transaksjonslisten for hver måned de ikke er ført, der du fører
        dem med ett trykk eller hopper over måneden.
      </p>

      {status ? <div className="status">{status}</div> : null}

      <div>
          <div className={styles["recurring-list"]}>
            {templates.map((template) => {
              const categoryName =
                categories.find((entry) => entry.id === template.category_id)
                  ?.category ?? "Ukategorisert";
              const isConfirmingDelete = confirmDeleteId === template.id;
              return (
                <div
                  key={template.id}
                  className={`${styles["recurring-row"]} ${template.active ? "" : styles["inactive"]}`}
                >
                  <span className={styles["recurring-day"]}>{template.day_of_month}.</span>
                  <span className={styles["recurring-item"]}>{template.item}</span>
                  <span className={`${styles["recurring-category"]} helper`}>{categoryName}</span>
                  <span className={styles["recurring-amount"]}>
                    {formatCurrency(template.price)}
                  </span>
                  <span className={styles["recurring-state"]}>
                    {!template.active ? <span className="helper">Pauset</span> : null}
                  </span>
                  <span className={styles["recurring-actions"]}>
                    {isConfirmingDelete ? (
                      <>
                        <button
                          className="icon-btn icon-btn-confirm"
                          type="button"
                          onClick={() => handleDelete(template)}
                          disabled={busy}
                          aria-label={`Bekreft sletting av ${template.item}`}
                          title="Slett malen. Allerede førte utgifter beholdes."
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
                          className="btn btn-ghost btn-small"
                          type="button"
                          onClick={() => handleToggleActive(template)}
                          disabled={busy}
                        >
                          {template.active ? "Pause" : "Aktiver"}
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          type="button"
                          onClick={() => setConfirmDeleteId(template.id)}
                          disabled={busy}
                          aria-label={`Slett ${template.item}`}
                          title="Slett fast utgift"
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
            {!templates.length ? (
              <div className="empty">
                Ingen faste utgifter ennå. Legg inn husleie, strøm og abonnementer
                én gang, så føres de med ett trykk hver måned.
              </div>
            ) : null}
          </div>

          {adding ? (
            <div className={styles["recurring-form"]}>
              <div className="field">
                <label htmlFor="recurring-item">Beskrivelse</label>
                <input
                  id="recurring-item"
                  value={draft.item}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, item: event.target.value }))
                  }
                  placeholder="Husleie"
                />
              </div>
              <div className="field">
                <label htmlFor="recurring-price">Beløp</label>
                <input
                  id="recurring-price"
                  type="number"
                  value={draft.price}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, price: event.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label htmlFor="recurring-category">Kategori</label>
                <select
                  id="recurring-category"
                  value={draft.categoryId}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">Velg kategori...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurring-day">Dag i måneden</label>
                <input
                  id="recurring-day"
                  type="number"
                  min="1"
                  max="31"
                  value={draft.dayOfMonth}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      dayOfMonth: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="recurring-tag">Merkelapp</label>
                <input
                  id="recurring-tag"
                  value={draft.tag}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, tag: event.target.value }))
                  }
                  placeholder="Valgfritt"
                />
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft(emptyDraft);
                  }}
                >
                  Avbryt
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleAddTemplate}
                  disabled={busy}
                >
                  Lagre
                </button>
              </div>
            </div>
          ) : (
            <button
              className={`btn btn-ghost ${styles["recurring-add"]}`}
              type="button"
              onClick={() => setAdding(true)}
            >
              <IconPlus />
              Ny fast utgift
            </button>
          )}
      </div>
    </section>
  );
}
