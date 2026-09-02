import { parseCsv } from "./csv";
import { parseAmountCell, parseDateCell } from "./savings";

export type DraftExpense = {
  date: string;
  item: string;
  /** Whole kroner, always positive — the category's kind carries the sign. */
  price: number;
  /** The category *name* as written in the file; "" when the file has none. */
  category: string;
  tag: string | null;
  /** What the file's own sign said: money in, or money out. */
  incoming: boolean;
};

export type ExpenseImport = {
  rows: DraftExpense[];
  /** Human-readable problems, each naming the line it came from. */
  errors: string[];
  /** The category names the file mentions, first-seen order. */
  categories: string[];
  /** True when the file uses both signs, which is what makes `incoming` mean
   *  anything: a statement listing only positive numbers says nothing about
   *  direction, so the caller must not read income out of it. */
  signed: boolean;
};

// Header aliases, matched case-insensitively. Our own CSV export writes the
// Norwegian names; the rest are what a bank or spreadsheet tends to emit.
const DATE_HEADERS = new Set([
  "dato",
  "date",
  "bokføringsdato",
  "bokforingsdato",
  "transaksjonsdato",
  "dag",
]);
const ITEM_HEADERS = new Set([
  "beskrivelse",
  "tekst",
  "text",
  "item",
  "description",
  "forklaring",
  "melding",
  "navn",
  "name",
]);
const AMOUNT_HEADERS = new Set([
  "beløp",
  "belop",
  "amount",
  "sum",
  "verdi",
  "value",
  "kroner",
  "nok",
]);
const CATEGORY_HEADERS = new Set(["kategori", "category", "type"]);
const TAG_HEADERS = new Set(["merkelapp", "tag", "label", "etikett"]);

function findColumn(headers: string[], names: Set<string>) {
  return headers.findIndex((header) => names.has(header));
}

/**
 * Read a CSV of transactions into drafts the caller can preview before writing.
 *
 * Requires a header row naming at least a date, a description and an amount
 * column; category and merkelapp are optional (a file without them leaves
 * `category` blank for the caller to assign). Every rejected row is reported
 * with its line number instead of being dropped silently.
 *
 * ponytail: one amount column. A statement with separate "Inn"/"Ut" columns
 * has to be reshaped first; add a second lookup here if that turns up often.
 */
export function parseExpenseCsv(text: string): ExpenseImport {
  const table = parseCsv(text);
  const empty: ExpenseImport = {
    rows: [],
    errors: [],
    categories: [],
    signed: false,
  };
  if (!table.length) return { ...empty, errors: ["Filen er tom."] };

  const headers = table[0].map((cell) => cell.trim().toLowerCase());
  const dateAt = findColumn(headers, DATE_HEADERS);
  const itemAt = findColumn(headers, ITEM_HEADERS);
  const amountAt = findColumn(headers, AMOUNT_HEADERS);
  const categoryAt = findColumn(headers, CATEGORY_HEADERS);
  const tagAt = findColumn(headers, TAG_HEADERS);

  if (dateAt < 0 || itemAt < 0 || amountAt < 0) {
    return {
      ...empty,
      errors: [
        "Fant ikke kolonnene dato, beskrivelse og beløp i første rad. " +
          `Overskriftene i filen: ${headers.join(", ") || "(ingen)"}.`,
      ],
    };
  }

  const rows: DraftExpense[] = [];
  const errors: string[] = [];
  let anyPositive = false;
  let anyNegative = false;

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => !cell.trim())) return;

    const rawDate = cells[dateAt] ?? "";
    const rawAmount = cells[amountAt] ?? "";
    const date = parseDateCell(rawDate);
    const amount = parseAmountCell(rawAmount);
    const item = (cells[itemAt] ?? "").trim();

    if (!date) {
      errors.push(`Linje ${line}: «${rawDate.trim()}» er ikke en dato.`);
      return;
    }
    if (!item) {
      errors.push(`Linje ${line}: mangler beskrivelse.`);
      return;
    }
    if (amount === null) {
      errors.push(`Linje ${line}: «${rawAmount.trim()}» er ikke et beløp.`);
      return;
    }
    if (amount === 0) {
      errors.push(`Linje ${line}: beløpet er 0.`);
      return;
    }

    if (amount > 0) anyPositive = true;
    else anyNegative = true;

    rows.push({
      date,
      item,
      price: Math.abs(amount),
      category: categoryAt >= 0 ? (cells[categoryAt] ?? "").trim() : "",
      tag: tagAt >= 0 ? (cells[tagAt] ?? "").trim() || null : null,
      incoming: amount > 0,
    });
  });

  return {
    rows,
    errors,
    categories: Array.from(
      new Set(rows.map((row) => row.category).filter(Boolean))
    ),
    signed: anyPositive && anyNegative,
  };
}

/** The key a duplicate check compares on: same day, text, amount, category. */
export function expenseKey(row: {
  date: string | null;
  item: string;
  price: number;
  category: string;
}) {
  return [
    row.date ?? "",
    row.item.trim().toLowerCase(),
    row.price,
    row.category.trim().toLowerCase(),
  ].join("|");
}

/**
 * The kind to create a category the file mentions but the account lacks.
 *
 * Only a file that uses both signs can say anything about direction, and then
 * a category whose every row is money in is income. Everything else lands as
 * `variable`, which is where /budsjett expects to correct it.
 */
export function guessKind(
  rows: DraftExpense[],
  category: string,
  signed: boolean
): "income" | "variable" {
  if (!signed) return "variable";
  const mine = rows.filter((row) => row.category === category);
  return mine.length && mine.every((row) => row.incoming)
    ? "income"
    : "variable";
}
