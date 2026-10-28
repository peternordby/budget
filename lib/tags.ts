// Merkelapper: a trip or a project, with optional dates and budget, that
// expenses point at by id (`expense.tag_id`). Pure over plain values, so it is
// tested rather than eyeballed.

import { isSpendingKind } from "@/lib/categories";
import type { LedgerEntry } from "@/lib/insights";
import { isoDate } from "@/lib/periodStats";

/** How many purchases the card lists. */
export const TOP_PURCHASES = 5;

export type Tag = {
  id: number;
  name: string;
  /** YYYY-MM-DD; both or neither (a database check enforces it). */
  start: string | null;
  end: string | null;
  budget: number | null;
};

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findTagByName<T extends Tag>(tags: T[], name: string) {
  return tags.find((tag) => sameName(tag.name, name));
}

/**
 * The one order every list of merkelapper uses: under way today, then coming
 * up (soonest first), then past (most recent first), then undated by name.
 */
export function orderTags<T extends Tag>(tags: T[], today: string): T[] {
  const rank = (tag: Tag) =>
    !tag.start || !tag.end ? 3 : tag.start > today ? 1 : tag.end < today ? 2 : 0;
  return [...tags].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    switch (rank(a)) {
      case 1:
        return (a.start as string).localeCompare(b.start as string);
      case 2:
        return (b.end as string).localeCompare(a.end as string);
      default:
        return a.name.localeCompare(b.name, "nb");
    }
  });
}

/** The merkelapp whose dates hold `date` — what a new expense is preselected with. */
export function tagForDate<T extends Tag>(tags: T[], date: string): T | undefined {
  return tags.find((tag) => tag.start && tag.end && tag.start <= date && date <= tag.end);
}

export type TagMerge = { keep: Tag; drop: number[] };

/**
 * Tags whose names match ignoring case and surrounding space, folded into one.
 * 0010 created one tag per tagged expense, so a group's row count is its
 * purchase count: the most frequent spelling wins (then the oldest), and the
 * dates widen to cover every member, i.e. the first and last purchase.
 */
export function planTagMerge(tags: Tag[]): TagMerge[] {
  const groups = new Map<string, Tag[]>();
  tags.forEach((tag) => {
    const key = tag.name.trim().toLowerCase();
    if (key) groups.set(key, [...(groups.get(key) ?? []), tag]);
  });

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.id - b.id);
      const counts = new Map<string, number>();
      sorted.forEach((tag) => counts.set(tag.name.trim(), (counts.get(tag.name.trim()) ?? 0) + 1));
      const name = [...counts].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
      const starts = sorted.flatMap((tag) => (tag.start ? [tag.start] : [])).sort();
      const ends = sorted.flatMap((tag) => (tag.end ? [tag.end] : [])).sort();
      return {
        keep: {
          id: sorted[0].id,
          name,
          start: starts[0] ?? null,
          end: ends[ends.length - 1] ?? null,
          budget: sorted.find((tag) => tag.budget != null)?.budget ?? null,
        },
        drop: sorted.slice(1).map((tag) => tag.id),
      };
    });
}

/** Days from start to end, both included. */
export function daySpan(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

export type TagSummary = {
  tag: Tag;
  total: number;
  count: number;
  /** The tag's own dates when it has them, else its first and last purchase. */
  start: string;
  end: string;
  dated: boolean;
  /** Days from start to end, both included. */
  days: number;
  /** Bought before the start (tickets), during, and after the end. An undated
   *  tag has everything in `during`. */
  before: number;
  during: number;
  after: number;
  /** Largest first. */
  byCategory: { category: string; value: number }[];
  top: LedgerEntry[];
  /** Every day from start to end, quiet days as 0 — the cumulative line. */
  daily: { date: string; spent: number }[];
};

/**
 * One summary per merkelapp that has spending (income and savings under a tag
 * are not what a trip cost), in the order `tags` comes in. "Per dag" is the
 * whole total over the trip's days — the tickets bought months ahead are part
 * of what the trip cost per day away.
 */
export function tagSummaries(entries: LedgerEntry[], tags: Tag[]): TagSummary[] {
  const byTag = new Map<number, LedgerEntry[]>();
  entries.forEach((entry) => {
    if (entry.tagId == null || !isSpendingKind(entry.kind) || !entry.date) return;
    byTag.set(entry.tagId, [...(byTag.get(entry.tagId) ?? []), entry]);
  });

  return tags.flatMap((tag) => {
    const list = byTag.get(tag.id);
    if (!list) return [];

    const dates = list.map((entry) => entry.date).sort();
    const dated = Boolean(tag.start && tag.end);
    const start = dated ? (tag.start as string) : dates[0];
    const end = dated ? (tag.end as string) : dates[dates.length - 1];

    let before = 0;
    let after = 0;
    const perDay = new Map<string, number>();
    const perCategory = new Map<string, number>();
    list.forEach((entry) => {
      if (entry.date < start) before += entry.amount;
      else if (entry.date > end) after += entry.amount;
      else perDay.set(entry.date, (perDay.get(entry.date) ?? 0) + entry.amount);
      perCategory.set(entry.category, (perCategory.get(entry.category) ?? 0) + entry.amount);
    });

    const daily: TagSummary["daily"] = [];
    const [y, m, d] = start.split("-").map(Number);
    for (let i = 0; ; i += 1) {
      const date = isoDate(new Date(y, m - 1, d + i));
      daily.push({ date, spent: perDay.get(date) ?? 0 });
      if (date >= end) break;
    }

    const total = list.reduce((sum, entry) => sum + entry.amount, 0);
    return [
      {
        tag,
        total,
        count: list.length,
        start,
        end,
        dated,
        days: daily.length,
        before,
        during: total - before - after,
        after,
        byCategory: [...perCategory]
          .map(([category, value]) => ({ category, value }))
          .sort((a, b) => b.value - a.value),
        top: [...list].sort((a, b) => b.amount - a.amount).slice(0, TOP_PURCHASES),
        daily,
      },
    ];
  });
}
