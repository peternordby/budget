"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLedger } from "@/components/LedgerProvider";
import StackedAreaChart, {
  StackedAreaLegend,
} from "@/components/StackedAreaChart";
import MoreMenu from "@/components/MoreMenu";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/lib/useToast";
import { formatCurrency, formatDate, formatSignedCurrency } from "@/lib/format";
import {
  defaultOrder,
  holdings,
  parseAmountCell,
  parseSnapshotCsv,
  planSnapshot,
  snapshotGroups,
  stackedSeries,
  totalNow,
  totalSeries,
  valuesBefore,
  type DraftSnapshot,
  type ImportResult,
  type Snapshot,
} from "@/lib/savings";
import { IconChevronRight, IconPencil, IconPlus, IconX } from "@/components/icons";
import { decNumber, encField } from "@/lib/crypto";
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

/** The entry form: one date, a value per existing category (blank = not
 *  recorded that day), and any new categories typed in. */
type EntryForm = {
  date: string;
  values: Record<string, string>;
  added: { name: string; value: string }[];
};

function changeClass(change: number | null) {
  return change === null || change === 0
    ? "helper"
    : change > 0
      ? "text-income"
      : "text-expense";
}

export default function SparingPage() {
  const ledger = useLedger();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const [form, setForm] = useState<EntryForm | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [order, setOrder] = useState<string[] | null>(null);
  // The order mid-drag: the chart redraws from it live, as a transition so
  // the dragged row never waits on the chart. Stored only on release.
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
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
    // This page does not go through LedgerProvider (a savings history is small
    // and is only useful in full), so it decrypts its own amounts. `category`
    // is plaintext by design: it sits in `unique (user_id, category, date)`,
    // and ciphertext that differs on every write would make a re-imported CSV
    // duplicate rows instead of updating them.
    setSnapshots(
      await Promise.all(
        (data ?? []).map(async (row: any) => ({
          id: row.id,
          category: String(row.category),
          date: String(row.date),
          amount: await decNumber(row.amount),
        }))
      )
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
  const groups = useMemo(() => snapshotGroups(snapshots), [snapshots]);

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
    () => stackedSeries(snapshots, previewOrder ?? order ?? undefined),
    [snapshots, previewOrder, order]
  );

  // The chart reconciles the order itself; mirror that here so the reorder
  // handlers operate on the same list the legend is showing.
  const effectiveOrder = useMemo(
    () => chart.bands.map((band) => band.category),
    [chart.bands]
  );

  const persistOrder = useCallback((next: string[]) => {
    setPreviewOrder(null);
    setOrder(next);
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      // Order is a convenience; failing to store it must not break the page.
    }
  }, []);

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

  // --- Entry form ------------------------------------------------------------

  const storedOn = useCallback(
    (date: string) => snapshots.filter((snapshot) => snapshot.date === date),
    [snapshots]
  );

  // A date that already has a registrering opens it: one date is one snapshot.
  function formFor(date: string): EntryForm {
    return {
      date,
      values: Object.fromEntries(
        storedOn(date).map((snapshot) => [snapshot.category, String(snapshot.amount)])
      ),
      added: categoryNames.length ? [] : [{ name: "", value: "" }],
    };
  }

  function openForm(date = todayIso()) {
    closeImport();
    setShowRetired(false);
    setForm(formFor(date));
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: "start" });
      formRef.current
        ?.querySelector<HTMLInputElement>("input[inputmode]")
        ?.focus({ preventScroll: true });
    });
  }

  // Moving between two empty dates keeps what was typed (fixing the date after
  // filling in the values); onto or off a stored date reloads, so a stored
  // registrering is never silently merged into or copied elsewhere.
  function changeDate(next: string) {
    if (!form || !next) return;
    const reload = storedOn(next).length > 0 || storedOn(form.date).length > 0;
    setForm(reload ? formFor(next) : { ...form, date: next });
  }

  const editing = form ? storedOn(form.date).length > 0 : false;

  const before = useMemo(
    () => (form ? valuesBefore(snapshots, form.date) : new Map<string, number>()),
    [snapshots, form?.date]
  );

  const plan = useMemo(
    () =>
      form
        ? planSnapshot(snapshots, form.date, [
            ...categoryNames.map((category) => ({
              category,
              value: form.values[category] ?? "",
            })),
            ...form.added.map((row) => ({ category: row.name, value: row.value })),
          ])
        : null,
    [snapshots, form, categoryNames]
  );
  const changeCount = plan ? plan.upsert.length + plan.remove.length : 0;

  // Legend order (top of the stack first), so the form reads like the chart.
  // A category whose latest value is 0 is retired: hidden unless asked for,
  // or unless it has a value in the form.
  const retired = useMemo(
    () =>
      new Set(
        byCategory
          .filter((holding) => holding.amount === 0)
          .map((holding) => holding.category)
      ),
    [byCategory]
  );
  const legendOrder = useMemo(() => [...effectiveOrder].reverse(), [effectiveOrder]);
  const formCategories = form
    ? legendOrder.filter(
        (category) =>
          showRetired ||
          !retired.has(category) ||
          form.values[category] !== undefined
      )
    : [];
  const hiddenRetired = legendOrder.length - formCategories.length;

  function entryNote(category: string, value: string) {
    if (!value.trim()) {
      return storedOn(form!.date).some((row) => row.category === category)
        ? { text: "slettes", className: "text-expense" }
        : { text: "uendret", className: "helper" };
    }
    const amount = parseAmountCell(value);
    if (amount === null || amount < 0) {
      return { text: "ugyldig", className: "text-expense" };
    }
    const last = before.get(category);
    if (last === undefined) return { text: "ny", className: "helper" };
    return {
      text: formatSignedCurrency(amount - last),
      className: changeClass(amount - last),
    };
  }

  // (category, date) is unique, so re-entering a date you already recorded
  // corrects it rather than failing — which is also how a re-imported CSV
  // updates instead of duplicating.
  async function writeSnapshots(rows: DraftSnapshot[]) {
    return supabase.from("savings_snapshot").upsert(
      await Promise.all(
        rows.map(async (row) => ({
          user_id: ledger.userId,
          category: row.category.trim(),
          date: row.date,
          amount: await encField(row.amount),
        }))
      ),
      { onConflict: "user_id,category,date" }
    );
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !plan || !changeCount || plan.invalid.length) return;
    setBusy(true);
    const written = plan.upsert.length
      ? await writeSnapshots(plan.upsert)
      : { error: null };
    const removed =
      !written.error && plan.remove.length
        ? await supabase
            .from("savings_snapshot")
            .delete()
            .eq("user_id", ledger.userId)
            .in(
              "id",
              plan.remove.map((row) => row.id)
            )
        : { error: null };
    setBusy(false);

    const error = written.error ?? removed.error;
    if (error) {
      setStatus(error.message);
      await load();
      return;
    }
    setForm(null);
    showToast({
      message: `Registreringen fra ${formatDate(form.date)} er lagret.`,
      tone: "info",
    });
    await load();
  }

  // The whole date at once, with Angre writing the same rows back.
  async function handleDeleteSnapshot(date: string) {
    const rows = storedOn(date);
    setBusy(true);
    const { error } = await supabase
      .from("savings_snapshot")
      .delete()
      .eq("user_id", ledger.userId)
      .eq("date", date);
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    setForm(null);
    showToast({
      message: `Registreringen fra ${formatDate(date)} er slettet.`,
      tone: "info",
      actionLabel: "Angre",
      onAction: async () => {
        const { error: restoreError } = await writeSnapshots(rows);
        if (restoreError) {
          showToast({ message: restoreError.message, tone: "error" });
        }
        await load();
      },
    });
    await load();
  }

  // --- CSV import ------------------------------------------------------------

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
    closeImport();
    showToast({
      message:
        count === 1 ? "1 snapshot importert." : `${count} snapshots importert.`,
      tone: "info",
    });
    await load();
  }

  function closeImport() {
    setImportOpen(false);
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

  const importPanel = (
    <div className="import">
      <div className="import-head">
        <strong>Importer fra CSV</strong>
        <span className="helper">
          Enten «dato;kategori;beløp», eller en datokolonne fulgt av én
          kolonne per kategori. Semikolon, komma og tab fungerer alle.
        </span>
      </div>
      <input
        ref={fileInput}
        className="import-file"
        type="file"
        accept=".csv,text/csv,text/plain"
        aria-label="Velg CSV-fil"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {importPreview ? (
        <div className="import-preview">
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
            <div className="empty">Fant ingen gyldige rader i denne filen.</div>
          )}

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
              disabled={busy || !importPreview.rows.length}
            >
              {busy
                ? "Importerer..."
                : `Importer ${importPreview.rows.length} snapshots`}
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={closeImport}
              disabled={busy}
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const entryForm = form ? (
    <form ref={formRef} className={styles["entry"]} onSubmit={handleSave}>
      <div className={styles["entry-head"]}>
        <strong>
          {editing
            ? `Endrer registreringen fra ${formatDate(form.date)}`
            : "Ny registrering"}
        </strong>
        <input
          type="date"
          aria-label="Dato"
          value={form.date}
          required
          onChange={(event) => changeDate(event.target.value)}
        />
      </div>

      {formCategories.map((category) => {
        const value = form.values[category] ?? "";
        const note = entryNote(category, value);
        const last = before.get(category);
        return (
          <label key={category} className={styles["entry-row"]}>
            <span className={styles["entry-name"]}>
              <strong>{category}</strong>
              <span className="helper">
                {last === undefined ? "ingen tidligere" : `sist ${formatCurrency(last)}`}
              </span>
            </span>
            <input
              className="num"
              inputMode="numeric"
              autoComplete="off"
              value={value}
              onChange={(event) =>
                setForm({
                  ...form,
                  values: { ...form.values, [category]: event.target.value },
                })
              }
            />
            <span className={`num ${note.className}`}>{note.text}</span>
          </label>
        );
      })}

      {form.added.map((row, index) => {
        const update = (patch: Partial<typeof row>) =>
          setForm({
            ...form,
            added: form.added.map((other, at) =>
              at === index ? { ...other, ...patch } : other
            ),
          });
        return (
          <div key={index} className={styles["entry-row"]}>
            <input
              aria-label="Navn på ny kategori"
              placeholder="Navn"
              value={row.name}
              onChange={(event) => update({ name: event.target.value })}
            />
            <input
              className="num"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Verdi for ${row.name.trim() || "ny kategori"}`}
              value={row.value}
              onChange={(event) => update({ value: event.target.value })}
            />
            <button
              className="icon-btn icon-btn-danger"
              type="button"
              aria-label="Fjern raden"
              title="Fjern raden"
              onClick={() =>
                setForm({
                  ...form,
                  added: form.added.filter((_, at) => at !== index),
                })
              }
            >
              <IconX />
            </button>
          </div>
        );
      })}

      <div className="form-actions">
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() =>
            setForm({ ...form, added: [...form.added, { name: "", value: "" }] })
          }
        >
          <IconPlus />
          Ny kategori
        </button>
        {hiddenRetired > 0 ? (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => setShowRetired(true)}
          >
            Vis {hiddenRetired} avsluttede
          </button>
        ) : null}
      </div>

      {plan?.invalid.length ? (
        <div className="status">{plan.invalid.join(" ")}</div>
      ) : null}

      <div className="form-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !changeCount || Boolean(plan?.invalid.length)}
        >
          {busy
            ? "Lagrer..."
            : !changeCount
              ? "Lagre"
              : editing
                ? `Lagre ${changeCount} ${changeCount === 1 ? "endring" : "endringer"}`
                : `Lagre ${changeCount} ${changeCount === 1 ? "verdi" : "verdier"}`}
        </button>
        {editing ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => handleDeleteSnapshot(form.date)}
            disabled={busy}
          >
            Slett registrering
          </button>
        ) : null}
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setForm(null)}
          disabled={busy}
        >
          Avbryt
        </button>
      </div>
    </form>
  ) : null;

  return (
    <>
      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Sparing</h2>
          <div className="toolbar-actions">
            {form ? null : (
              <button
                className="btn btn-primary btn-small"
                type="button"
                onClick={() => openForm()}
                disabled={loading}
              >
                <IconPlus />
                Registrer beholdning
              </button>
            )}
            <MoreMenu
              label="Flere valg"
              items={[
                {
                  label: importOpen ? "Lukk import" : "Importer CSV",
                  onSelect: () => {
                    if (importOpen) {
                      closeImport();
                    } else {
                      setForm(null);
                      setImportOpen(true);
                    }
                  },
                },
              ]}
            />
          </div>
        </div>
        {status ? <div className="status">{status}</div> : null}
        {importOpen ? importPanel : null}
        {entryForm}

        {loading ? (
          <div className="empty">Laster sparing...</div>
        ) : !snapshots.length ? (
          form || importOpen ? null : (
            <div className="empty">
              Ingen beholdninger registrert ennå. Trykk «Registrer beholdning»,
              eller importer historikken din som CSV fra ⋮-menyen.
            </div>
          )
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
            </div>

            <StackedAreaChart
              chart={chart}
              hoverIndex={hoverIndex}
              onHoverIndex={setHoverIndex}
            />
            <div className={styles["legend-head-row"]}>
              <span className="helper">
                Rekkefølgen bestemmer hvilken kategori som ligger nederst i
                grafen. Dra i håndtaket for å flytte en rad.
              </span>
              {/* Always in the layout, only hidden: it toggles as the order
                  changes — mid-drag too, with the live preview — and coming
                  and going it changed this row's height, the page scrolled to
                  compensate, the row under the pointer moved, and the drag
                  swapped again: the page flickered up and down. */}
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={() => persistOrder(defaultOrder(snapshots))}
                style={orderIsCustom ? undefined : { visibility: "hidden" }}
                aria-hidden={orderIsCustom ? undefined : true}
                tabIndex={orderIsCustom ? undefined : -1}
              >
                Nullstill rekkefølge
              </button>
            </div>
            <StackedAreaLegend
              chart={chart}
              hoverIndex={hoverIndex}
              onPreview={(next) => startTransition(() => setPreviewOrder(next))}
              onReorder={persistOrder}
            />
          </>
        )}
      </section>

      {groups.length ? (
        <section className="card section-gap">
          <div className="card-head">
            <h2 className="section-title">Historikk</h2>
            <span className="helper">
              {groups.length === 1 ? "1 registrering" : `${groups.length} registreringer`}
            </span>
          </div>

          <div className={styles["history"]}>
            {groups.map((group, index) => {
              const names = group.entries.map((entry) => entry.snapshot.category);
              return (
                <div key={group.date} className={styles["snapshot"]}>
                  {/* Native <details>: the newest starts open, the rest are
                      one tap away. The pencil sits outside the <summary>,
                      since a button inside one would also toggle it. */}
                  <details open={index === 0}>
                    <summary className={styles["snapshot-summary"]}>
                      <span className={styles["chevron"]} aria-hidden="true">
                        <IconChevronRight />
                      </span>
                      <span className={styles["snapshot-date"]}>
                        {formatDate(group.date)}
                      </span>
                      <span
                        className={`helper ${styles["snapshot-names"]}`}
                        title={names.join(", ")}
                      >
                        {names.slice(0, 3).join(", ")}
                        {names.length > 3 ? ` +${names.length - 3}` : ""}
                      </span>
                      <strong className="num">{formatCurrency(group.total)}</strong>
                      <span className={`num ${changeClass(group.change)}`}>
                        {group.change === null
                          ? "—"
                          : formatSignedCurrency(group.change)}
                      </span>
                    </summary>
                    {group.entries.map(({ snapshot, change }) => (
                      <div key={snapshot.id} className={styles["snapshot-entry"]}>
                        <span>{snapshot.category}</span>
                        <span className="num">{formatCurrency(snapshot.amount)}</span>
                        <span className={`num ${changeClass(change)}`}>
                          {change === null ? "—" : formatSignedCurrency(change)}
                        </span>
                      </div>
                    ))}
                  </details>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => openForm(group.date)}
                    disabled={busy}
                    aria-label={`Endre registreringen fra ${formatDate(group.date)}`}
                    title="Endre"
                  >
                    <IconPencil />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
