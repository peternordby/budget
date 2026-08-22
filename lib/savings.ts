// Savings snapshots: an observed balance for one category on one date.
//
// Deliberately independent of `expense` — nothing here derives a balance from
// transactions. A fund is worth what it is worth today, not the sum of the
// deposits made into it, which is exactly what the old goal feature could not
// express.

import { parseCsv } from "./csv";

export type Snapshot = {
  id: number;
  category: string;
  date: string; // YYYY-MM-DD
  amount: number;
};

/** A snapshot as it exists before it has been written (no id yet). */
export type DraftSnapshot = {
  category: string;
  date: string;
  amount: number;
};

export type CategoryHolding = {
  category: string;
  /** The most recent snapshot for this category. */
  amount: number;
  date: string;
  /** The snapshot before that, if there is one — else null. */
  previousAmount: number | null;
  previousDate: string | null;
  /** amount - previousAmount, or null when there is nothing to compare to. */
  change: number | null;
  /** Every snapshot for this category, oldest first. */
  history: Snapshot[];
};

function byDateAscending(a: Snapshot, b: Snapshot) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Same date, same category is impossible (a unique constraint covers it),
  // but across categories a stable tiebreak keeps output deterministic.
  return a.category.localeCompare(b.category, "nb");
}

/**
 * Group snapshots per category, newest state first, largest holding first.
 */
export function holdings(snapshots: Snapshot[]): CategoryHolding[] {
  const byCategory = new Map<string, Snapshot[]>();

  for (const snapshot of snapshots) {
    const list = byCategory.get(snapshot.category);
    if (list) list.push(snapshot);
    else byCategory.set(snapshot.category, [snapshot]);
  }

  const result: CategoryHolding[] = [];
  for (const [category, list] of byCategory) {
    const history = [...list].sort(byDateAscending);
    const latest = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;
    result.push({
      category,
      amount: latest.amount,
      date: latest.date,
      previousAmount: previous ? previous.amount : null,
      previousDate: previous ? previous.date : null,
      change: previous ? latest.amount - previous.amount : null,
      history,
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

/** Sum of the newest snapshot of every category. */
export function totalNow(snapshots: Snapshot[]): number {
  return holdings(snapshots).reduce((sum, holding) => sum + holding.amount, 0);
}

export type TotalPoint = { date: string; total: number };

/**
 * Total value across all categories, at every date any category was observed.
 *
 * Categories are snapshotted on whatever date the user happened to look, so on
 * most dates only one of them has a fresh number. Summing only that date's rows
 * would draw a total that collapses to a single category and then jumps back —
 * so each category's last known value is carried forward until it is observed
 * again. A category contributes nothing before its first snapshot: it did not
 * exist yet, and back-filling it would invent history.
 */
export function totalSeries(snapshots: Snapshot[]): TotalPoint[] {
  if (!snapshots.length) return [];

  const sorted = [...snapshots].sort(byDateAscending);
  const lastKnown = new Map<string, number>();
  const points: TotalPoint[] = [];

  let index = 0;
  while (index < sorted.length) {
    const date = sorted[index].date;
    // Apply every snapshot sharing this date before reading the total, so a
    // date carrying two categories produces one point, not two.
    while (index < sorted.length && sorted[index].date === date) {
      lastKnown.set(sorted[index].category, sorted[index].amount);
      index += 1;
    }
    let total = 0;
    for (const amount of lastKnown.values()) total += amount;
    points.push({ date, total });
  }

  return points;
}

// --- Stacked chart -----------------------------------------------------------

export type StackBand = {
  category: string;
  /**
   * The category's value at each timeline date, or null where it has none.
   *
   * Null means "we have no observation to claim", which happens before the
   * category's first snapshot. After that the last known value is carried
   * forward: a savings balance persists whether or not you looked at it that
   * day. Retiring a category is therefore done by recording a `0` — which
   * carries forward like any other value and contributes nothing to the stack,
   * so no separate "closed" flag is needed.
   */
  values: (number | null)[];
  /** Cumulative baseline and top edge, for drawing the band. */
  lower: (number | null)[];
  upper: (number | null)[];
  /**
   * Height of everything below this band at every index, including the ones
   * where the band itself is absent. `lower` is null there; this is not, and
   * that is what lets a band that starts mid-timeline be anchored flat against
   * its neighbour instead of leaving a hole in the stack.
   */
  baselineAt: number[];
  firstIndex: number;
  latest: number;
  latestDate: string;
  change: number | null;
  /**
   * True when the category was not observed on the newest timeline date, so
   * everything drawn after `lastObserved` is carried forward rather than
   * measured. Surfaced in the legend so propped-up money is never silent.
   */
  stale: boolean;
  lastObserved: string;
};

export type StackedChart = {
  dates: string[];
  /** Bottom of the stack first — the order the legend controls. */
  bands: StackBand[];
  totals: number[];
  max: number;
};

/**
 * Days since the epoch for a YYYY-MM-DD string.
 *
 * Built from the parts via Date.UTC rather than `new Date(iso)` so it cannot
 * shift a date across a day boundary in a negative-offset timezone — the same
 * trap formatDate in lib/format.ts avoids.
 */
export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Horizontal position of each date as a 0..1 fraction, proportional to elapsed
 * time rather than evenly spaced.
 *
 * Snapshots land on whatever dates the user happened to look, so even spacing
 * would draw a two-year gap and a one-week gap the same width and misreport
 * every slope. A single date, or several on the same day, sits at 0.
 */
export function datePositions(dates: string[]): number[] {
  if (dates.length <= 1) return dates.map(() => 0);
  const days = dates.map(dayNumber);
  const first = days[0];
  const span = days[days.length - 1] - first;
  if (span <= 0) return dates.map(() => 0);
  return days.map((day) => (day - first) / span);
}

/**
 * Default stack order: largest current holding at the bottom, so the biggest
 * band is the most stable one to read against.
 */
export function defaultOrder(snapshots: Snapshot[]): string[] {
  return holdings(snapshots).map((holding) => holding.category);
}

/**
 * Reconcile a saved legend order with the categories that actually exist.
 *
 * A stored order outlives the data it was made for — a category can be
 * deleted, and an import can add ones the order has never seen. Known names
 * keep their saved position; unknown ones are dropped; new ones are appended
 * in default order, so a fresh import appears rather than being invisible.
 */
export function reconcileOrder(
  saved: string[],
  snapshots: Snapshot[]
): string[] {
  const existing = defaultOrder(snapshots);
  const known = new Set(existing);
  const kept = saved.filter((name) => known.has(name));
  const seen = new Set(kept);
  return [...kept, ...existing.filter((name) => !seen.has(name))];
}

/**
 * Build the stacked series: one band per category, bottom-first in `order`.
 *
 * A null contributes no height, so a category that starts late simply has no
 * band until its first snapshot, and the bands below it keep their baseline.
 * `totals` is the top edge, and matches totalSeries for the same input.
 */
export function stackedSeries(
  snapshots: Snapshot[],
  order?: string[]
): StackedChart {
  if (!snapshots.length) {
    return { dates: [], bands: [], totals: [], max: 0 };
  }

  const dates = [...new Set(snapshots.map((snapshot) => snapshot.date))].sort();
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const byCategory = holdings(snapshots);
  const holdingByName = new Map(
    byCategory.map((holding) => [holding.category, holding])
  );

  const wanted = order?.length
    ? reconcileOrder(order, snapshots)
    : defaultOrder(snapshots);

  // Running baseline, so each band sits on the ones already placed.
  const baseline = new Array(dates.length).fill(0);
  const bands: StackBand[] = [];

  for (const category of wanted) {
    const holding = holdingByName.get(category);
    if (!holding) continue;

    const observed = new Array<number | null>(dates.length).fill(null);
    for (const snapshot of holding.history) {
      const at = dateIndex.get(snapshot.date);
      if (at !== undefined) observed[at] = snapshot.amount;
    }

    const values: (number | null)[] = new Array(dates.length).fill(null);
    let carried: number | null = null;
    let firstIndex = -1;
    for (let i = 0; i < dates.length; i += 1) {
      const value = observed[i];
      if (value !== null) {
        carried = value;
        if (firstIndex === -1) firstIndex = i;
      }
      // Before the first snapshot `carried` is still null, which is exactly
      // the "nothing to claim yet" case.
      values[i] = carried;
    }

    const baselineAt = [...baseline];
    const lower: (number | null)[] = new Array(dates.length).fill(null);
    const upper: (number | null)[] = new Array(dates.length).fill(null);
    for (let i = 0; i < dates.length; i += 1) {
      const value = values[i];
      if (value === null) continue;
      lower[i] = baseline[i];
      upper[i] = baseline[i] + value;
      baseline[i] += value;
    }

    bands.push({
      category,
      values,
      lower,
      upper,
      baselineAt,
      firstIndex,
      latest: holding.amount,
      latestDate: holding.date,
      change: holding.change,
      stale: holding.date !== dates[dates.length - 1],
      lastObserved: holding.date,
    });
  }

  const totals = [...baseline];
  return { dates, bands, totals, max: Math.max(1, ...totals) };
}

/**
 * Contiguous runs of indices where a band has a value, so a series with a
 * leading gap draws as one shape starting where the data does — rather than a
 * polygon anchored at x=0 with an invented left edge.
 */
export function bandSegments(band: StackBand): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  band.values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

export type BandPoint = {
  index: number;
  lower: number;
  upper: number;
  /** True for a zero-height point added to close the stack, not observed. */
  anchor: boolean;
};

/**
 * The polygons to draw for one band, as points rather than pixels.
 *
 * A band that starts mid-timeline gets a zero-height anchor at the index
 * before it appears (and after it disappears, for an interior gap). Without
 * it the stack tears open: the bands *above* interpolate smoothly from the
 * previous date toward this band's new height, while this band itself starts
 * abruptly at its first date — leaving a wedge of background between two
 * layers that should be flush, and misreporting the total across that gap.
 *
 * The anchor claims no balance. It has zero thickness, which is exactly what
 * "this category did not exist yet" should look like, and it sits on the
 * height of the bands below so the seam is exact.
 */
export function bandShapes(band: StackBand): BandPoint[][] {
  const lastIndex = band.values.length - 1;

  return bandSegments(band).map((segment) => {
    const points: BandPoint[] = [];
    const first = segment[0];
    const last = segment[segment.length - 1];

    if (first > 0) {
      const base = band.baselineAt[first - 1] ?? 0;
      points.push({ index: first - 1, lower: base, upper: base, anchor: true });
    }

    for (const index of segment) {
      points.push({
        index,
        lower: band.lower[index] as number,
        upper: band.upper[index] as number,
        anchor: false,
      });
    }

    if (last < lastIndex) {
      const base = band.baselineAt[last + 1] ?? 0;
      points.push({ index: last + 1, lower: base, upper: base, anchor: true });
    }

    return points;
  });
}

// --- CSV import -------------------------------------------------------------

export type ImportResult = {
  /** Which shape the file turned out to be, for the preview to report. */
  layout: "long" | "wide";
  rows: DraftSnapshot[];
  /** Human-readable problems, each naming the line it came from. */
  errors: string[];
};

const DATE_HEADERS = new Set(["dato", "date", "dag", "day"]);
const CATEGORY_HEADERS = new Set([
  "kategori",
  "category",
  "konto",
  "account",
  "navn",
  "name",
  "type",
]);
const AMOUNT_HEADERS = new Set([
  "beløp",
  "belop",
  "amount",
  "sum",
  "verdi",
  "value",
  "saldo",
  "balance",
  "kroner",
  "nok",
]);

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/^﻿/, "");
}

/**
 * Parse a date cell to YYYY-MM-DD.
 *
 * Accepts ISO (2026-08-22), Norwegian dotted (22.08.2026), and slashed
 * (22/08/2026) forms, plus two-digit years. Day-first is assumed for the
 * dotted and slashed forms because that is what nb-NO writes; an ISO string is
 * unambiguous and parsed as-is. Returns null rather than guessing when the
 * value is not a date or names a day that does not exist.
 */
export function parseDateCell(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (local) {
    day = Number(local[1]);
    month = Number(local[2]);
    const yearPart = local[3];
    // A two-digit year in a savings history is this century, not the 1900s.
    year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1) return null;
  // Reject a day the month does not have (31 February) rather than letting
  // Date roll it forward into the next month.
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse an amount cell to whole kroner.
 *
 * Tolerates what a spreadsheet actually emits: thousands separators (space,
 * non-breaking space, apostrophe, or period), a trailing currency label, a
 * Norwegian decimal comma, and parenthesised negatives. Returns null for
 * anything that isn't a number.
 */
export function parseAmountCell(value: string): number | null {
  let raw = value.trim();
  if (!raw) return null;

  const parenthesised = /^\((.*)\)$/.exec(raw);
  if (parenthesised) raw = `-${parenthesised[1]}`;

  // Strip currency labels and any spacing used as a thousands separator.
  raw = raw
    .replace(/(kr|nok|,-)/gi, "")
    .replace(/[\s  ']/g, "")
    .trim();

  // Whichever of . or , appears last is the decimal separator; the other is a
  // thousands separator. "1.234,50" and "1,234.50" both mean the same thing.
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    const thousands = decimalAt === lastComma ? "." : ",";
    raw =
      raw.slice(0, decimalAt).split(thousands).join("") +
      "." +
      raw.slice(decimalAt + 1);
  } else if (lastComma >= 0) {
    // A lone comma is a decimal comma when it leaves 1-2 trailing digits
    // ("1234,50"), and a thousands separator otherwise ("1,234").
    const trailing = raw.length - lastComma - 1;
    raw = trailing > 0 && trailing <= 2
      ? raw.slice(0, lastComma) + "." + raw.slice(lastComma + 1)
      : raw.split(",").join("");
  } else if (lastDot >= 0) {
    const trailing = raw.length - lastDot - 1;
    if (!(trailing > 0 && trailing <= 2)) raw = raw.split(".").join("");
  }

  if (!/^-?\d*\.?\d+$/.test(raw)) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return Math.round(parsed);
}

/**
 * Read a CSV of historical snapshots, in either shape a hand-kept sheet takes:
 *
 *   long:  dato;kategori;beløp        one row per snapshot
 *   wide:  dato;Fond;BSU              one row per date, one column per category
 *
 * The layout is detected from the header, so a file does not have to be
 * reshaped before import. Blank cells in the wide shape mean "not observed
 * that day" and are skipped rather than recorded as 0. Every rejected row is
 * reported with its line number instead of being dropped silently, and the
 * caller is expected to show all of this before writing anything.
 */
export function parseSnapshotCsv(text: string): ImportResult {
  const table = parseCsv(text);
  const errors: string[] = [];

  if (!table.length) {
    return { layout: "long", rows: [], errors: ["Filen er tom."] };
  }

  const header = table[0].map(normaliseHeader);
  const dateIndex = header.findIndex((cell) => DATE_HEADERS.has(cell));
  const categoryIndex = header.findIndex((cell) => CATEGORY_HEADERS.has(cell));
  const amountIndex = header.findIndex((cell) => AMOUNT_HEADERS.has(cell));

  const isLong = dateIndex >= 0 && categoryIndex >= 0 && amountIndex >= 0;
  const rows: DraftSnapshot[] = [];

  // Last write wins for a repeated (category, date) inside one file, matching
  // what the database's unique constraint does on upsert.
  const seen = new Map<string, number>();
  const push = (draft: DraftSnapshot) => {
    const key = `${draft.category.toLowerCase()} ${draft.date}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, rows.length);
      rows.push(draft);
    } else {
      rows[at] = draft;
    }
  };

  if (isLong) {
    for (let i = 1; i < table.length; i += 1) {
      const line = i + 1;
      const cells = table[i];
      if (cells.every((cell) => cell.trim() === "")) continue;

      const date = parseDateCell(cells[dateIndex] ?? "");
      const category = (cells[categoryIndex] ?? "").trim();
      const amount = parseAmountCell(cells[amountIndex] ?? "");

      if (!date) {
        errors.push(`Linje ${line}: «${cells[dateIndex] ?? ""}» er ikke en dato.`);
        continue;
      }
      if (!category) {
        errors.push(`Linje ${line}: mangler kategori.`);
        continue;
      }
      if (amount === null) {
        errors.push(
          `Linje ${line}: «${cells[amountIndex] ?? ""}» er ikke et beløp.`
        );
        continue;
      }
      if (amount < 0) {
        errors.push(`Linje ${line}: beløpet kan ikke være negativt.`);
        continue;
      }
      push({ category, date, amount });
    }

    return { layout: "long", rows, errors };
  }

  // Wide: the first column is the date, every remaining titled column is a
  // category. An untitled column carries no category name, so it is skipped.
  const categories = table[0]
    .map((cell, index) => ({ name: cell.trim(), index }))
    .filter((column) => column.index > 0 && column.name !== "");

  if (!categories.length) {
    return {
      layout: "wide",
      rows: [],
      errors: [
        "Fant ingen kategorikolonner. Forventet «dato;kategori;beløp», eller en datokolonne fulgt av én kolonne per kategori.",
      ],
    };
  }

  for (let i = 1; i < table.length; i += 1) {
    const line = i + 1;
    const cells = table[i];
    if (cells.every((cell) => cell.trim() === "")) continue;

    const date = parseDateCell(cells[0] ?? "");
    if (!date) {
      errors.push(`Linje ${line}: «${cells[0] ?? ""}» er ikke en dato.`);
      continue;
    }

    for (const column of categories) {
      const cell = (cells[column.index] ?? "").trim();
      // Not observed that day — a real absence, not a zero balance.
      if (!cell) continue;

      const amount = parseAmountCell(cell);
      if (amount === null) {
        errors.push(
          `Linje ${line}, ${column.name}: «${cell}» er ikke et beløp.`
        );
        continue;
      }
      if (amount < 0) {
        errors.push(`Linje ${line}, ${column.name}: beløpet kan ikke være negativt.`);
        continue;
      }
      push({ category: column.name, date, amount });
    }
  }

  return { layout: "wide", rows, errors };
}
