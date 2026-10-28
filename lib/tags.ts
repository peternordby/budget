// /innsikt's tag card: everything spent under one merkelapp, which in practice
// is a trip. Pure over LedgerEntry, so it is tested rather than eyeballed.

import { isSpendingKind } from "@/lib/categories";
import type { LedgerEntry } from "@/lib/insights";
import { isoDate } from "@/lib/periodStats";

/** How many purchases the card lists. */
export const TOP_PURCHASES = 5;

export type TagSummary = {
  tag: string;
  total: number;
  count: number;
  /** First and last day with a purchase, YYYY-MM-DD. */
  first: string;
  last: string;
  /** Calendar days from first to last, both included. */
  days: number;
  /** Largest first. */
  byCategory: { category: string; value: number }[];
  top: LedgerEntry[];
  /** Every day from first to last, quiet days as 0 — the cumulative line. */
  daily: { date: string; spent: number }[];
};

/**
 * One summary per tag over its spending (income and savings under a tag are
 * not what a trip cost), most recent trip first.
 */
export function tagSummaries(entries: LedgerEntry[]): TagSummary[] {
  const byTag = new Map<string, LedgerEntry[]>();
  entries.forEach((entry) => {
    const tag = entry.tag?.trim();
    if (!tag || !isSpendingKind(entry.kind) || !entry.date) return;
    byTag.set(tag, [...(byTag.get(tag) ?? []), entry]);
  });

  return [...byTag]
    .map(([tag, list]) => {
      const dates = list.map((entry) => entry.date).sort();
      const first = dates[0];
      const last = dates[dates.length - 1];

      const perDay = new Map<string, number>();
      const perCategory = new Map<string, number>();
      list.forEach((entry) => {
        perDay.set(entry.date, (perDay.get(entry.date) ?? 0) + entry.amount);
        perCategory.set(entry.category, (perCategory.get(entry.category) ?? 0) + entry.amount);
      });

      const daily: TagSummary["daily"] = [];
      const [y, m, d] = first.split("-").map(Number);
      for (let i = 0; ; i += 1) {
        const date = isoDate(new Date(y, m - 1, d + i));
        daily.push({ date, spent: perDay.get(date) ?? 0 });
        if (date >= last) break;
      }

      return {
        tag,
        total: list.reduce((sum, entry) => sum + entry.amount, 0),
        count: list.length,
        first,
        last,
        days: daily.length,
        byCategory: [...perCategory]
          .map(([category, value]) => ({ category, value }))
          .sort((a, b) => b.value - a.value),
        top: [...list].sort((a, b) => b.amount - a.amount).slice(0, TOP_PURCHASES),
        daily,
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last) || a.tag.localeCompare(b.tag, "nb"));
}
