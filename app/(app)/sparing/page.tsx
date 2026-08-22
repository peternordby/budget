"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLedger } from "@/components/LedgerProvider";
import StackedAreaChart, {
  StackedAreaLegend,
} from "@/components/StackedAreaChart";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, formatDate, formatSignedCurrency } from "@/lib/format";
import {
  defaultOrder,
  holdings,
  parseSnapshotCsv,
  reconcileOrder,
  stackedSeries,
  totalNow,
  totalSeries,
  type DraftSnapshot,
  type ImportResult,
  type Snapshot,
} from "@/lib/savings";
import { IconTrash } from "@/components/icons";
import styles from "./sparing.module.css";

// Per-device, like the activity table's column order (budget.column-order.v1):
// which band sits at the bottom of the stack is a reading preference, not data.
const ORDER_KEY = "budget.savings-order.v1";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export default function SparingPage() {
  const ledger = useLedger();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState({
    category: "",
    date: todayIso(),
    amount: "",
  });

  const [categoryFilter, setCategoryFilter] = useState("");
  const [order, setOrder] = useState<string[] | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importName, setImportName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Savings snapshots are deliberately outside LedgerProvider: they are not
  // derived from `expense`, nothing else on any route reads them, and the
  // provider's rolling 24-month window would be wrong here — a savings history
  // is small and is only ever useful in full.
  const load = useCallback(async () => {
    if (!ledger.userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("savings_snapshot")
      .select("id, category, date, amount")
      .eq("user_id", ledger.userId)
      .order("date", { ascending: true });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }
    setSnapshots(
      (data ?? []).map((row: any) => ({
        id: row.id,
        category: String(row.category),
        date: String(row.date),
        amount: Number(row.amount) || 0,
      }))
    );
    setStatus(null);
    setLoading(false);
  }, [ledger.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const byCategory = useMemo(() => holdings(snapshots), [snapshots]);
  const total = useMemo(() => totalNow(snapshots), [snapshots]);
  const series = useMemo(() => totalSeries(snapshots), [snapshots]);

  // Read the stored order once, on the client only — localStorage does not
  // exist during the build's prerender of this route's shell.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORDER_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setOrder(
        Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
          ? parsed
          : []
      );
    } catch {
      // A private window, cleared site data, or malformed JSON: fall back to
      // the default order rather than leaving the chart unrendered.
      setOrder([]);
    }
  }, []);

  const chart = useMemo(
    () => stackedSeries(snapshots, order ?? undefined),
    [snapshots, order]
  );

  // The chart reconciles the order itself; mirror that here so the reorder
  // handlers operate on the same list the legend is showing.
  const effectiveOrder = useMemo(
    () => chart.bands.map((band) => band.category),
    [chart.bands]
  );

  const persistOrder = useCallback((next: string[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      // Order is a convenience; failing to store it must not break the page.
    }
  }, []);

  // The legend lists top-of-stack first, so "up" there means "later in the
  // stack order". Translating once here keeps the component presentational.
  const moveCategory = useCallback(
    (category: string, direction: -1 | 1) => {
      const from = effectiveOrder.indexOf(category);
      if (from === -1) return;
      const to = from - direction;
      if (to < 0 || to >= effectiveOrder.length) return;
      const next = [...effectiveOrder];
      next.splice(to, 0, next.splice(from, 1)[0]);
      persistOrder(next);
    },
    [effectiveOrder, persistOrder]
  );

  const dropCategory = useCallback(
    (dragged: string, target: string) => {
      if (dragged === target) return;
      const from = effectiveOrder.indexOf(dragged);
      const to = effectiveOrder.indexOf(target);
      if (from === -1 || to === -1) return;
      const next = [...effectiveOrder];
      next.splice(to, 0, next.splice(from, 1)[0]);
      persistOrder(next);
    },
    [effectiveOrder, persistOrder]
  );

  const orderIsCustom = useMemo(() => {
    const fallback = defaultOrder(snapshots);
    return (
      effectiveOrder.length === fallback.length &&
      effectiveOrder.some((name, index) => name !== fallback[index])
    );
  }, [effectiveOrder, snapshots]);

  // A hovered index from a previous, longer history would point past the end.
  useEffect(() => {
    setHoverIndex((current) =>
      current !== null && current >= chart.dates.length ? null : current
    );
  }, [chart.dates.length]);

  // Change in the whole portfolio between the two most recent dates any
  // category was observed on.
  const totalChange = useMemo(() => {
    if (series.length < 2) return null;
    return series[series.length - 1].total - series[series.length - 2].total;
  }, [series]);

  const categoryNames = useMemo(
    () =>
      [...new Set(snapshots.map((snapshot) => snapshot.category))].sort((a, b) =>
        a.localeCompare(b, "nb")
      ),
    [snapshots]
  );

  const history = useMemo(() => {
    const rows = categoryFilter
      ? snapshots.filter((snapshot) => snapshot.category === categoryFilter)
      : snapshots;
    // Newest first: the most recently recorded number is the one being checked.
    return [...rows].sort((a, b) =>
      a.date === b.date
        ? a.category.localeCompare(b.category, "nb")
        : a.date < b.date
          ? 1
          : -1
    );
  }, [snapshots, categoryFilter]);

  const draftAmount = Number(draft.amount);
  const draftValid =
    Boolean(draft.category.trim()) &&
    Boolean(draft.date) &&
    draft.amount.trim() !== "" &&
    Number.isFinite(draftAmount) &&
    draftAmount >= 0;

  // (category, date) is unique, so re-entering a date you already recorded
  // corrects it rather than failing — which is also how a re-imported CSV
  // updates instead of duplicating.
  async function writeSnapshots(rows: DraftSnapshot[]) {
    return supabase.from("savings_snapshot").upsert(
      rows.map((row) => ({
        user_id: ledger.userId,
        category: row.category.trim(),
        date: row.date,
        amount: row.amount,
      })),
      { onConflict: "user_id,category,date" }
    );
  }

  async function handleAdd() {
    if (!draftValid) return;
    setBusy(true);
    const { error } = await writeSnapshots([
      {
        category: draft.category,
        date: draft.date,
        amount: Math.round(draftAmount),
      },
    ]);
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    setDraft((prev) => ({ ...prev, amount: "" }));
    await load();
  }

  async function handleDelete(snapshot: Snapshot) {
    setBusy(true);
    const { error } = await supabase
      .from("savings_snapshot")
      .delete()
      .eq("id", snapshot.id)
      .eq("user_id", ledger.userId);
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    await load();
  }

  // Parse on selection and show what was understood; nothing is written until
  // the preview is confirmed, which is what makes guessing the file's layout
  // and delimiter safe.
  async function handleFile(file: File) {
    setStatus(null);
    const text = await file.text();
    setImportName(file.name);
    setImportPreview(parseSnapshotCsv(text));
  }

  async function handleConfirmImport() {
    if (!importPreview?.rows.length) return;
    setBusy(true);
    // Chunked so a long history does not go out as one oversized request.
    for (let i = 0; i < importPreview.rows.length; i += 200) {
      const { error } = await writeSnapshots(
        importPreview.rows.slice(i, i + 200)
      );
      if (error) {
        setStatus(error.message);
        setBusy(false);
        await load();
        return;
      }
    }
    const count = importPreview.rows.length;
    setBusy(false);
    cancelImport();
    setStatus(
      count === 1 ? "1 snapshot importert." : `${count} snapshots importert.`
    );
    await load();
  }

  function cancelImport() {
    setImportPreview(null);
    setImportName("");
    // Without this the same file cannot be picked twice in a row: the input
    // fires no change event when its value is unchanged.
    if (fileInput.current) fileInput.current.value = "";
  }

  const importCategories = useMemo(() => {
    if (!importPreview) return [];
    return [...new Set(importPreview.rows.map((row) => row.category))];
  }, [importPreview]);

  const importDateRange = useMemo(() => {
    if (!importPreview?.rows.length) return null;
    const dates = importPreview.rows.map((row) => row.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [importPreview]);

  const newCategoryCount = useMemo(() => {
    const known = new Set(categoryNames.map((name) => name.toLowerCase()));
    return importCategories.filter((name) => !known.has(name.toLowerCase()))
      .length;
  }, [importCategories, categoryNames]);

  return (
    <>
      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Sparing</h2>
          <span className="helper">
            Registrerte beholdninger, uavhengig av transaksjonene
          </span>
        </div>
        {status ? <div className="status">{status}</div> : null}

        {loading ? (
          <div className="empty">Laster sparing...</div>
        ) : !snapshots.length ? (
          <div className="empty">
            Ingen beholdninger registrert ennå. Legg inn en verdi under, eller
            importer en CSV med historikken din.
          </div>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-label">Total nå</span>
                <strong className="stat-value">{formatCurrency(total)}</strong>
                <span className="helper">
                  per {formatDate(series[series.length - 1].date)}
                </span>
              </div>
              {totalChange !== null ? (
                <div className="stat">
                  <span className="stat-label">Endring</span>
                  <strong
                    className={`stat-value ${
                      totalChange >= 0 ? "is-good" : "is-bad"
                    }`}
                  >
                    {formatSignedCurrency(totalChange)}
                  </strong>
                  <span className="helper">
                    fra {formatDate(series[series.length - 2].date)}
                  </span>
                </div>
              ) : null}
              <div className="stat stat-small">
                <span className="stat-label">Kategorier</span>
                <strong className="stat-value">{byCategory.length}</strong>
              </div>
              <div className="stat stat-small">
                <span className="stat-label">Registreringer</span>
                <strong className="stat-value">{snapshots.length}</strong>
              </div>
            </div>

            <StackedAreaChart
              chart={chart}
              hoverIndex={hoverIndex}
              onHoverIndex={setHoverIndex}
            />
            <div className={styles["legend-head-row"]}>
              <span className="helper">
                Rekkefølgen bestemmer hvilken kategori som ligger nederst i
                grafen. Dra en rad, eller bruk pilene.
              </span>
              {orderIsCustom ? (
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={() => persistOrder(defaultOrder(snapshots))}
                >
                  Nullstill rekkefølge
                </button>
              ) : null}
            </div>
            <StackedAreaLegend
              chart={chart}
              hoverIndex={hoverIndex}
              onMove={moveCategory}
              onDrop={dropCategory}
              dragging={dragging}
              dragTarget={dragTarget}
              onDragState={(next, target) => {
                setDragging(next);
                setDragTarget(target);
              }}
            />
          </>
        )}
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Registrer verdi</h2>
          <span className="helper">
            Samme kategori og dato to ganger overskriver den forrige verdien
          </span>
        </div>

        <div className="toolbar">
          <div className="field">
            <label htmlFor="savings-category">Kategori</label>
            <input
              id="savings-category"
              list="savings-category-options"
              value={draft.category}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="Fond"
            />
            {/* Native datalist: existing names are suggested, a new one is
                still free to type. */}
            <datalist id="savings-category-options">
              {categoryNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="savings-date">Dato</label>
            <input
              id="savings-date"
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, date: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="savings-amount">Verdi</label>
            <input
              id="savings-amount"
              type="number"
              min="0"
              step="1"
              value={draft.amount}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, amount: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAdd();
              }}
              placeholder="124500"
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-primary btn-small"
              type="button"
              onClick={handleAdd}
              disabled={busy || !draftValid}
            >
              Lagre
            </button>
          </div>
        </div>

        <div className={styles["import"]}>
          <div className={styles["import-head"]}>
            <strong>Importer fra CSV</strong>
            <span className="helper">
              Enten «dato;kategori;beløp», eller en datokolonne fulgt av én
              kolonne per kategori. Semikolon, komma og tab fungerer alle.
            </span>
          </div>
          <input
            ref={fileInput}
            className={styles["import-file"]}
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Velg CSV-fil"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          {importPreview ? (
            <div className={styles["import-preview"]}>
              <div className="card-head">
                <strong>{importName}</strong>
                <span className="badge">
                  {importPreview.layout === "long"
                    ? "dato/kategori/beløp"
                    : "én kolonne per kategori"}
                </span>
              </div>

              {importPreview.rows.length ? (
                <>
                  <div className="stat-row">
                    <div className="stat stat-small">
                      <span className="stat-label">Snapshots</span>
                      <strong className="stat-value">
                        {importPreview.rows.length}
                      </strong>
                    </div>
                    <div className="stat stat-small">
                      <span className="stat-label">Kategorier</span>
                      <strong className="stat-value">
                        {importCategories.length}
                      </strong>
                      {newCategoryCount > 0 ? (
                        <span className="helper">{newCategoryCount} nye</span>
                      ) : null}
                    </div>
                    {importDateRange ? (
                      <div className="stat stat-small">
                        <span className="stat-label">Periode</span>
                        <strong className="stat-value">
                          {formatDate(importDateRange.from)} –{" "}
                          {formatDate(importDateRange.to)}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  <p className="helper">
                    Kategorier: {importCategories.join(", ")}
                  </p>
                </>
              ) : (
                <div className="empty">
                  Fant ingen gyldige rader i denne filen.
                </div>
              )}

              {importPreview.errors.length ? (
                <details className={styles["import-errors"]}>
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
                  disabled={busy || !importPreview.rows.length}
                >
                  {busy
                    ? "Importerer..."
                    : `Importer ${importPreview.rows.length} snapshots`}
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={cancelImport}
                  disabled={busy}
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {snapshots.length ? (
        <section className="card section-gap">
          <div className="card-head">
            <h2 className="section-title">Historikk</h2>
            <span className="helper">
              {history.length}
              {categoryFilter ? ` av ${snapshots.length}` : ""} registreringer
            </span>
          </div>

          <div className="toolbar">
            <div className="field">
              <label htmlFor="savings-history-filter">Kategori</label>
              <select
                id="savings-history-filter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">Alle kategorier</option>
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles["history"]}>
            <div className={styles["history-header"]} role="row">
              <span>Dato</span>
              <span>Kategori</span>
              <span className="num">Verdi</span>
              <span className="num">Endring</span>
              <span />
            </div>
            {history.map((snapshot) => {
              // The previous snapshot of the same category, which is what a
              // change is measured against — not the row above, which may
              // belong to a different category.
              const own = byCategory.find(
                (holding) => holding.category === snapshot.category
              );
              const index =
                own?.history.findIndex((row) => row.id === snapshot.id) ?? -1;
              const previous =
                own && index > 0 ? own.history[index - 1] : null;
              const change = previous ? snapshot.amount - previous.amount : null;

              return (
                <div key={snapshot.id} className={styles["history-row"]}>
                  <span className="helper">{formatDate(snapshot.date)}</span>
                  <strong>{snapshot.category}</strong>
                  <strong className="num">
                    {formatCurrency(snapshot.amount)}
                  </strong>
                  <span
                    className={`num ${
                      change === null
                        ? "helper"
                        : change >= 0
                          ? "text-income"
                          : "text-expense"
                    }`}
                  >
                    {change === null ? "—" : formatSignedCurrency(change)}
                  </span>
                  <button
                    className="icon-btn icon-btn-danger"
                    type="button"
                    onClick={() => handleDelete(snapshot)}
                    disabled={busy}
                    aria-label={`Slett ${snapshot.category} ${formatDate(snapshot.date)}`}
                    title="Slett"
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
