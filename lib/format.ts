export function formatCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return "0 kr";
  }

  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0
  }).format(value);

  return `${formatted} kr`;
}

export function formatDate(value: string | null) {
  if (!value) return "Ingen dato";

  // Parse YYYY-MM-DD directly to avoid UTC-to-local timezone shift
  // when using new Date("2025-01-15") which is UTC midnight.
  const parts = value.split("-");
  if (parts.length !== 3) return "Ingen dato";
  const [year, month, day] = parts;
  if (!year || !month || !day) return "Ingen dato";

  return `${day}.${month}.${year.slice(-2)}`;
}

export function toNumber(value: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
