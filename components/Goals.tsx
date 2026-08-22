"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/format";
import { isSavingsKind } from "@/lib/categories";
import { useLedger } from "@/components/LedgerProvider";
import styles from "./Goals.module.css";

type Goal = { id: number; name: string; target: number };

export default function Goals() {
  const ledger = useLedger();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [saved, setSaved] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", target: "" });
  const [busy, setBusy] = useState(false);

  const savingsCategoryIds = useMemo(
    () =>
      ledger.categories
        .filter((category) => isSavingsKind(category.kind))
        .map((category) => category.id),
    [ledger.categories]
  );

  // Progress is deliberately queried all-time rather than read from
  // ledger.expenses: the provider only holds a rolling 24-month window, and a
  // goal that reads "30 000 of 50 000" because the older half fell out of the
  // window is worse than no number at all.
  const load = useCallback(async () => {
    setLoading(true);
    const goalResult = await supabase
      .from("goal")
      .select("id, name, target")
      .eq("user_id", ledger.userId)
      .order("created_at", { ascending: true });

    if (goalResult.error) {
      setStatus(goalResult.error.message);
      setLoading(false);
      return;
    }
    setGoals(goalResult.data ?? []);

    const totals = new Map<string, number>();
    if (savingsCategoryIds.length) {
      const savedResult = await supabase
        .from("expense")
        .select("tag, price")
        .eq("user_id", ledger.userId)
        .in("category_id", savingsCategoryIds)
        .not("tag", "is", null);

      if (savedResult.error) {
        setStatus(savedResult.error.message);
        setLoading(false);
        return;
      }
      (savedResult.data ?? []).forEach((row: any) => {
        const key = String(row.tag).trim().toLowerCase();
        totals.set(key, (totals.get(key) ?? 0) + (Number(row.price) || 0));
      });
    }
    setSaved(totals);
    setStatus(null);
    setLoading(false);
  }, [ledger.userId, savingsCategoryIds]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    const target = Math.round(Number(draft.target));
    if (!draft.name.trim() || !Number.isFinite(target) || target <= 0) return;

    setBusy(true);
    const { error } = await supabase.from("goal").insert({
      name: draft.name.trim(),
      target,
      user_id: ledger.userId,
    });
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    setDraft({ name: "", target: "" });
    await load();
  }

  async function handleDelete(goal: Goal) {
    setBusy(true);
    const { error } = await supabase
      .from("goal")
      .delete()
      .eq("id", goal.id)
      .eq("user_id", ledger.userId);
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    await load();
  }

  return (
    <section className="card section-gap">
      <div className="activity-head">
        <h2 className="section-title">Sparemål</h2>
        <span className="helper">
          Framgang teller sparing merket med målets navn
        </span>
      </div>
      {status ? <div className="status">{status}</div> : null}

      {loading ? (
        <div className="empty">Laster sparemål...</div>
      ) : goals.length === 0 ? (
        <div className="empty">
          Ingen sparemål ennå. Legg til ett under, og merk sparingen med samme
          navn i transaksjonene for å se framgangen.
        </div>
      ) : (
        <div className={styles["goal-list"]}>
          {goals.map((goal) => {
            const progress = saved.get(goal.name.trim().toLowerCase()) ?? 0;
            const percent = Math.min((progress / goal.target) * 100, 100);
            const reached = progress >= goal.target;
            return (
              <div key={goal.id} className={styles["goal-row"]}>
                <div className={styles["goal-head"]}>
                  <strong>{goal.name}</strong>
                  <span className={reached ? "text-income" : "helper"}>
                    {formatCurrency(progress)} av {formatCurrency(goal.target)}
                  </span>
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    onClick={() => handleDelete(goal)}
                    disabled={busy}
                    aria-label={`Slett sparemålet ${goal.name}`}
                  >
                    Slett
                  </button>
                </div>
                <div className={styles["goal-track"]}>
                  <div
                    className={`${styles["goal-fill"]} ${reached ? styles["goal-reached"] : ""}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="helper">
                  {reached
                    ? "Målet er nådd."
                    : `${formatCurrency(goal.target - progress)} igjen`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles["goal-form"]}>
        <div className="field">
          <label htmlFor="goal-name">Navn</label>
          <input
            id="goal-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Feriepenger"
          />
        </div>
        <div className="field">
          <label htmlFor="goal-target">Mål</label>
          <input
            id="goal-target"
            type="number"
            min="1"
            step="1"
            value={draft.target}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, target: event.target.value }))
            }
            placeholder="20000"
          />
        </div>
        <button
          className="btn btn-primary btn-small"
          type="button"
          onClick={handleAdd}
          disabled={busy || !draft.name.trim() || !draft.target}
        >
          Legg til
        </button>
      </div>
    </section>
  );
}
