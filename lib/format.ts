export function formatCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0
  }).format(value);

  return `${formatted} kr`;
}

export function formatDate(value: string | null) {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${day}.${month}.${year}`;
}

export function toNumber(value: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
