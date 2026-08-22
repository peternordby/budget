// Pure helpers for fixed monthly expenses. A template describes a cost that
// repeats every month; materializing it creates an ordinary expense row whose
// recurring_id points back here, which is what keeps generation idempotent.

import { formatDateParts } from "@/lib/format";

export type RecurringTemplate = {
  id: number;
  item: string;
  price: number;
  category_id: number;
  tag: string | null;
  day_of_month: number;
  active: boolean;
};

// The subset of an expense row this module needs to decide what is already booked.
export type BookedRef = {
  recurring_id: number | null;
  date: string | null; // YYYY-MM-DD
};

export function lastDayOfMonth(year: number, month: number) {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

export function materializationDate(
  template: RecurringTemplate,
  year: number,
  month: number
) {
  const day = Math.min(template.day_of_month, lastDayOfMonth(year, month));
  return formatDateParts(year, month, day);
}

export function pendingTemplates(
  templates: RecurringTemplate[],
  booked: BookedRef[],
  year: number,
  month: number,
  // Whether `booked` reflects a successful expense fetch. When the caller's
  // load failed (or hasn't finished), we cannot tell what is already booked,
  // so nothing should be reported as pending — that would offer to double-book.
  bookedKnown = true
) {
  if (!bookedKnown) return [];

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const bookedIds = new Set<number>();

  booked.forEach((entry) => {
    if (entry.recurring_id == null) return;
    if (!entry.date || !entry.date.startsWith(prefix)) return;
    bookedIds.add(entry.recurring_id);
  });

  return templates.filter(
    (template) => template.active && !bookedIds.has(template.id)
  );
}
