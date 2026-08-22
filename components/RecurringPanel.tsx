"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/format";
import { useLedger } from "@/components/LedgerProvider";
import {
  materializationDate,
  pendingTemplates,
  type BookedRef,
  type RecurringTemplate,
} from "@/lib/recurring";
import { IconChevronDown } from "@/components/icons";
import styles from "./RecurringPanel.module.css";

type RecurringPanelProps = {
  userId: string;
  month: { year: number; month: number } | null;
  monthLabel: string;
  bookedExpenses: BookedRef[];
  bookedLoading: boolean;
  bookedKnown: boolean;
  categories: { id: number; category: string }[];
  onGenerated: () => void;
};

const emptyDraft = {
  item: "",
  price: "",
  categoryId: "",
  tag: "",
  dayOfMonth: "1",
};

export default function RecurringPanel({
  userId,
  month,
  monthLabel,
  bookedExpenses,
  bookedLoading,
  bookedKnown,
  categories,
  onGenerated,
}: RecurringPanelProps) {
  const ledger = useLedger();
  const templates = ledger.templates;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [collapsed, setCollapsed] = useState(true);

  const pending = month
    ? pendingTemplates(
        templates,
        bookedExpenses,
        month.year,
        month.month,
        bookedKnown
      )
    : [];
  const activeCount = templates.filter((template) => template.active).length;

  async function handleGenerate() {
    if (!month || bookedLoading || !bookedKnown || !pending.length) return;

    setBusy(true);
    setStatus(null);

    const rows = pending.map((template) => ({
      item: template.item,
      price: template.price,
      category_id: template.category_id,
      tag: template.tag,
      user_id: userId,
      date: materializationDate(template, month.year, month.month),
      recurring_id: template.id,
    }));

    const { error } = await supabase.from("expense").insert(rows);

    if (error) {
      setStatus(error.message);
    } else {
      setStatus(`La inn ${rows.length} faste utgifter for ${monthLabel}.`);
      onGenerated();
    }

    setBusy(false);
  }

  async function handleAddTemplate() {
    const parsed = Number(draft.price);
    const day = Number(draft.dayOfMonth);
    if (!draft.item.trim() || !draft.categoryId || !Number.isFinite(parsed)) return;
    if (!Number.isFinite(day) || day < 1 || day > 31) return;

    setBusy(true);
    setStatus(null);

    const { error } = await supabase.from("recurring_expense").insert({
      item: draft.item.trim(),
      price: Math.round(Math.abs(parsed)),
      category_id: Number(draft.categoryId),
      tag: draft.tag.trim() || null,
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

  return (
    <section className="card section-gap recurring-card">
      <div className="card-head">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-controls="recurring-body"
        >
          <span className={`collapse-chevron ${collapsed ? "collapsed" : ""}`}>
            <IconChevronDown />
          </span>
          <h2 className="section-title">Faste utgifter</h2>
        </button>
        <span className="card-head-meta">
          <span className="helper">{activeCount} aktive</span>
          {month && !bookedLoading && pending.length ? (
            <span className="badge badge-warn">{pending.length} mangler</span>
          ) : null}
        </span>
      </div>

      {status ? <div className="status">{status}</div> : null}

      {!collapsed ? (
        <div id="recurring-body">
          {!month ? (
            <p className="helper">
              Velg én måned for å legge inn faste utgifter.
            </p>
          ) : bookedLoading ? (
            <p className="helper">Laster transaksjoner...</p>
          ) : !bookedKnown ? (
            <p className="helper">
              Transaksjoner kunne ikke lastes, så faste utgifter kan ikke føres akkurat nå.
            </p>
          ) : pending.length ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleGenerate}
              disabled={busy}
            >
              {busy
                ? "Legger inn..."
                : `Legg inn ${pending.length} faste utgifter for ${monthLabel}`}
            </button>
          ) : activeCount ? (
            <p className="helper">
              Alle faste utgifter er allerede ført for {monthLabel}.
            </p>
          ) : null}

          <div className={styles["recurring-list"]}>
            {templates.map((template) => {
              const categoryName =
                categories.find((entry) => entry.id === template.category_id)
                  ?.category ?? "Ukategorisert";
              const isPending = pending.some((entry) => entry.id === template.id);
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
                  <span className={`${styles["recurring-state"]} helper`}>
                    {!template.active
                      ? "Pauset"
                      : bookedLoading || !bookedKnown
                        ? ""
                        : isPending
                          ? "Ikke ført"
                          : month
                            ? "Ført"
                            : ""}
                  </span>
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    onClick={() => handleToggleActive(template)}
                    disabled={busy}
                  >
                    {template.active ? "Pause" : "Aktiver"}
                  </button>
                </div>
              );
            })}
            {!templates.length ? (
              <div className="empty">
                Ingen faste utgifter ennå. Legg inn husleie, strøm og abonnementer
                én gang, så føres de med ett klikk hver måned.
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
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setAdding(true)}
            >
              Ny fast utgift
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
