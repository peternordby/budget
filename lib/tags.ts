// Merkelapper: a trip or a project, with optional dates and budget, that
// expenses point at by id (`expense.tag_id`). Pure over plain values, so it is
// tested rather than eyeballed.

import { isSpendingKind } from "@/lib/categories";
import type { LedgerEntry } from "@/lib/insights";
import { isoDate, shortDate } from "@/lib/periodStats";

/** How many purchases the card lists. */
export const TOP_PURCHASES = 5;

/**
 * A stop on a trip: a city or a whole country, found through OpenStreetMap's
 * Nominatim geocoder (components/PlacePicker.tsx). Stored on the tag as one encrypted
 * JSON array (`tag.places`), in itinerary order.
 */
export type Place = {
  name: string;
  /** The country's name, as the geocoder gave it (bokmål). */
  country: string;
  /** ISO 3166-1 alpha-2. */
  cc: string;
  lat: number;
  lon: number;
  kind: "city" | "country";
  /** YYYY-MM-DD: the first day here. A stop holds every day from its arrival
   *  until the next stop's. */
  arrive: string | null;
};

export type Tag = {
  id: number;
  name: string;
  /** YYYY-MM-DD; both or neither (a database check enforces it). */
  start: string | null;
  end: string | null;
  budget: number | null;
  places: Place[];
};

/** The decrypted `tag.places` column; anything unreadable is no places. */
export function parsePlaces(text: string | null): Place[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Dated stops in arrival order, undated ones (a country around its cities)
 *  first in the order they were added — what a save stores. */
export function sortPlaces(places: Place[]): Place[] {
  return [...places].sort((a, b) => (a.arrive ?? "").localeCompare(b.arrive ?? ""));
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The first match in the list's order — so with orderTags, a current or
 *  upcoming trip wins over a past one of the same name (the CSV import). */
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

/** "1. jul. – 7. jul. 2026", the year on the start only when it differs. */
export function tagDates(start: string, end: string) {
  if (start === end) return shortDate(start, true);
  const withYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${shortDate(start, withYear)} – ${shortDate(end, true)}`;
}

/**
 * What a list shows for each merkelapp: the name plus its dates, so "Hytta"
 * every summer reads as different trips. An undated one is just its name,
 * unless another merkelapp shares it ("uten datoer" then tells them apart).
 */
export function tagLabels(tags: Tag[]): Map<number, string> {
  const counts = new Map<string, number>();
  tags.forEach((tag) => {
    const key = tag.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Map(
    tags.map((tag) => {
      if (tag.start && tag.end) return [tag.id, `${tag.name} (${tagDates(tag.start, tag.end)})`];
      if ((counts.get(tag.name.trim().toLowerCase()) ?? 0) < 2) return [tag.id, tag.name];
      return [tag.id, `${tag.name} (uten datoer)`];
    })
  );
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

export type Stop = {
  /** Index into the tag's places; -1 for days no stop holds. */
  index: number;
  place: Place | null;
  spent: number;
  days: number;
};

/**
 * Which stop each day of the trip belongs to, and what was spent at each. A
 * day belongs to the last stop arrived at on or before it; a lone place with
 * no arrival holds the whole trip. Days before the first arrival are `-1`
 * ("uten sted") — as is everything when no stop is dated. Only the trip's own
 * days are placed: tickets bought before it are `before`, not a city's.
 */
export function placeStops(summary: TagSummary): { dayStop: number[]; stops: Stop[] } {
  const places = summary.tag.places;
  const arrivals = places.map((place) =>
    place.arrive ?? (places.length === 1 ? summary.start : null)
  );
  const dayStop = summary.daily.map((day) => {
    let owner = -1;
    arrivals.forEach((arrive, index) => {
      if (arrive && arrive <= day.date && (owner < 0 || arrive >= (arrivals[owner] as string))) {
        owner = index;
      }
    });
    return owner;
  });

  const stops = [-1, ...places.keys()].map((index) => ({
    index,
    place: index < 0 ? null : places[index],
    spent: 0,
    days: 0,
  }));
  dayStop.forEach((owner, day) => {
    stops[owner + 1].spent += summary.daily[day].spent;
    stops[owner + 1].days += 1;
  });
  // The unplaced bucket only when it has days; every place always, so an
  // undated country still shows on the map.
  return { dayStop, stops: stops.filter((stop) => stop.index >= 0 || stop.days > 0) };
}

/**
 * The stops a trip's map draws a dot for: every dated stop, including one
 * passed through on the day another took over (two cities on one day give the
 * day to the later one, so the earlier has no days of its own but was still
 * visited); an undated place only where it holds days or is the trip's only
 * one. An undated country around its cities is left to the shading.
 */
export function mapStops(stops: Stop[]): Stop[] {
  return stops.filter(
    (stop) => stop.place && (stop.days > 0 || stop.place.arrive || stops.length === 1)
  );
}

/** A stop's stay in words: its days, "innom" for a dated stop with none of its own, or "ikke datert". */
export function stayLabel(stop: Stop): string {
  if (stop.days) return stop.days === 1 ? "1 dag" : `${stop.days} dager`;
  return stop.place?.arrive ? "innom" : "ikke datert";
}
