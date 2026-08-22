// What a category *is*, as opposed to what it is called. This replaces a
// comparison against the literal category name "inntekter", which was the
// app's only notion of category semantics and could not express the
// fixed/variable split or savings transfers.

export const CATEGORY_KINDS = [
  "income",
  "fixed",
  "variable",
  "savings",
] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

const KIND_SET = new Set<string>(CATEGORY_KINDS);

// The database column is constrained, but rows arrive as untyped JSON and the
// project runs with `strict: false`, so an unexpected value would otherwise
// flow straight into a comparison. Unknown means "ordinary spending".
export function toCategoryKind(value: unknown): CategoryKind {
  return typeof value === "string" && KIND_SET.has(value)
    ? (value as CategoryKind)
    : "variable";
}

export function isIncomeKind(kind: CategoryKind) {
  return kind === "income";
}

// Money actually consumed. Deliberately excludes savings: moving kroner into a
// savings category is a transfer, and counting it as spending inflates every
// month-over-month comparison and every anomaly threshold.
export function isSpendingKind(kind: CategoryKind) {
  return kind === "fixed" || kind === "variable";
}

export function isSavingsKind(kind: CategoryKind) {
  return kind === "savings";
}

export const KIND_LABELS: Record<CategoryKind, string> = {
  income: "Inntekt",
  fixed: "Fast utgift",
  variable: "Variabel utgift",
  savings: "Sparing",
};
