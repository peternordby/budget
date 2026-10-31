"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLedger, toLedgerEntries } from "@/components/LedgerProvider";
import { BulletBar, ShareBar } from "@/components/charts";
import { TripMap, TripTimeline, stopPoints, type MapPoint } from "@/components/TripMap";
import { IconCheck, IconPlus } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { keyToRef } from "@/lib/period";
import { isoDate, shortDate } from "@/lib/periodStats";
import { categoryColor, categorySlots } from "@/lib/categoryColor";
import { daySpan, placeStops, stayLabel, tagDates, tagSummaries, type Stop, type TagSummary } from "@/lib/tags";
import styles from "./TagInsight.module.css";

/** Where a dated trip sits relative to today: "om 12 dager", "dag 3 av 7", … */
function whenLabel(summary: TagSummary, today: string) {
  if (!summary.dated) return null;
  if (today < summary.start) {
    const days = daySpan(today, summary.start) - 1;
    return days === 1 ? "I morgen" : `Om ${days} dager`;
  }
  if (today <= summary.end) {
    return `Pågår · dag ${daySpan(summary.start, today)} av ${summary.days}`;
  }
  const ago = daySpan(summary.end, today) - 1;
  if (ago < 45) return ago === 1 ? "I går" : `For ${ago} dager siden`;
  const months = Math.round(ago / 30.4);
  return months < 24 ? `For ${months} måneder siden` : `For ${Math.round(months / 12)} år siden`;
}

/**
 * Innsikt › Reiser: every merkelapp as a card to pick from, then one trip in
 * detail or several side by side. Plain click picks one trip; the corner
 * toggle (or Ctrl/⌘/shift-click) adds or removes one, and "Alle reiser"
 * takes them all — a toggle rather than a modifier alone, so a phone can do it.
 * Deliberately not scoped to the period picker: a trip has its own dates.
 */
export default function TagInsight() {
  const ledger = useLedger();

  // Tags are all-time, so the whole history has to be fetched; availableMonths
  // is all-time already, and ensureMonthCovered settles once it is covered.
  const firstMonth = ledger.availableMonths[0];
  const { ensureMonthCovered } = ledger;
  useEffect(() => {
    if (firstMonth) ensureMonthCovered(keyToRef(firstMonth));
  }, [firstMonth, ensureMonthCovered]);

  const tags = useMemo(
    () => tagSummaries(toLedgerEntries(ledger.expenses), ledger.tags),
    [ledger.expenses, ledger.tags]
  );
  const [picked, setPicked] = useState<number[]>([]);
  const live = picked.filter((id) => tags.some((row) => row.tag.id === id));
  const ids = live.length ? live : tags.slice(0, 1).map((row) => row.tag.id);
  const chosen = tags.filter((row) => ids.includes(row.tag.id));

  if (!chosen.length) {
    return <div className="empty">Ingen utgifter har en merkelapp ennå.</div>;
  }

  // Never down to none: removing the last one keeps it.
  const toggle = (id: number) =>
    setPicked(
      ids.includes(id) ? (ids.length > 1 ? ids.filter((x) => x !== id) : ids) : [...ids, id]
    );
  const all = tags.length > 1 && chosen.length === tags.length;

  return (
    <div className={styles["body"]}>
      <div className={styles["trips"]} role="group" aria-label="Velg reiser">
        {tags.length > 1 ? (
          <button
            type="button"
            className={`${styles["trip"]} ${styles["trip-all"]}`}
            aria-pressed={all}
            onClick={() => setPicked(tags.map((row) => row.tag.id))}
          >
            <strong>Alle reiser</strong>
            <span>{tags.length} merkelapper</span>
            <span className={styles["trip-total"]}>
              {formatCurrency(tags.reduce((sum, row) => sum + row.total, 0))}
            </span>
          </button>
        ) : null}
        {tags.map((row) => {
          const on = ids.includes(row.tag.id);
          return (
            <div key={row.tag.id} className={styles["trip-wrap"]}>
              <button
                type="button"
                className={styles["trip"]}
                aria-pressed={on}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) toggle(row.tag.id);
                  else setPicked([row.tag.id]);
                }}
              >
                <strong>{row.tag.name}</strong>
                <span>{row.dated ? tagDates(row.start, row.end) : "Uten datoer"}</span>
                <span className={styles["trip-total"]}>{formatCurrency(row.total)}</span>
              </button>
              {tags.length > 1 ? (
                <button
                  type="button"
                  className={`icon-btn icon-btn-sm ${styles["trip-add"]} ${on ? "is-on" : ""}`}
                  aria-pressed={on}
                  aria-label={on ? `Fjern ${row.tag.name} fra utvalget` : `Legg ${row.tag.name} til utvalget`}
                  title={on ? "Fjern fra utvalget" : "Legg til i utvalget"}
                  onClick={() => toggle(row.tag.id)}
                >
                  {on ? <IconCheck /> : <IconPlus />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {chosen.length === 1 ? (
        <TripDetail key={chosen[0].tag.id} summary={chosen[0]} tags={tags} />
      ) : (
        <TripsOverview summaries={chosen} onPick={(id) => setPicked([id])} />
      )}
    </div>
  );
}

/** A trip's spending by category: the share bar and its legend. */
export function CategoryShare({
  byCategory,
  label,
}: {
  byCategory: { category: string; value: number }[];
  label: string;
}) {
  const slots = useMemo(() => categorySlots(byCategory.map((row) => row.category)), [byCategory]);
  return (
    <>
      <ShareBar
        segments={byCategory.map((row) => ({
          key: row.category,
          label: row.category,
          value: row.value,
          color: categoryColor(slots.get(row.category) ?? 1),
        }))}
        formatValue={formatCurrency}
        ariaLabel={`${label} fordelt på ${byCategory.length} kategorier`}
      />
      <div className={styles["legend"]}>
        {byCategory.map((row) => (
          <span key={row.category}>
            <span
              className="breakdown-dot"
              style={{ background: categoryColor(slots.get(row.category) ?? 1) }}
            />
            {row.category} <strong>{formatCurrency(row.value)}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * One merkelapp — usually a trip — read as its own period: what it cost, per
 * day and against the other trips, where (a map of its stops, sized by what
 * each cost), when (a column per day, coloured by stop) and on what. With
 * dates set, "per dag" is everything on the trip — tickets bought months
 * ahead included — over the days away. Hovering a stop on the map, the
 * timeline or the table lights it up in all three.
 */
function TripDetail({ summary, tags }: { summary: TagSummary; tags: TagSummary[] }) {
  const today = isoDate(new Date());
  const [activeStop, setActiveStop] = useState<string | null>(null);

  const slots = useMemo(
    () => categorySlots(summary.byCategory.map((row) => row.category)),
    [summary]
  );
  const itinerary = useMemo(() => placeStops(summary), [summary]);
  // Stops share the category slots' validated palette, set-aware so two stops
  // side by side on the timeline never land on one colour.
  const stopSlots = useMemo(
    () => categorySlots(summary.tag.places.map((place) => place.name)),
    [summary]
  );
  const stopColor = useCallback(
    (stop: Stop) =>
      stop.place
        ? categoryColor(stopSlots.get(stop.place.name) ?? 1)
        : summary.tag.places.length
          ? "var(--muted)"
          : "var(--accent)",
    [stopSlots, summary]
  );
  const points = useMemo(() => stopPoints(itinerary.stops, stopColor), [itinerary, stopColor]);

  const { tag } = summary;
  const withYear = summary.start.slice(0, 4) !== summary.end.slice(0, 4);
  const rank = [...tags].sort((a, b) => b.total - a.total).indexOf(summary) + 1;
  const priciest = summary.daily.reduce((max, day) => (day.spent > max.spent ? day : max));
  const over = tag.budget != null && summary.total > tag.budget;
  const perDay = Math.round(summary.total / summary.days);
  // Per dag against the other dated trips — what makes a number a story.
  const others = tags.filter((row) => row !== summary && row.dated && row.days > 1);
  const usual = others.length
    ? others.reduce((sum, row) => sum + row.total / row.days, 0) / others.length
    : null;
  const versus = usual && summary.dated ? Math.round((perDay / usual - 1) * 100) : null;
  const countries = [...new Set(tag.places.map((place) => place.country))];
  const when = whenLabel(summary, today);

  return (
    <>
      <div className={styles["hero"]}>
        <div>
          {when ? <span className={styles["when"]}>{when}</span> : null}
          <h3 className={styles["hero-name"]}>{tag.name}</h3>
          <span className="helper">
            {summary.days > 1 ? tagDates(summary.start, summary.end) : shortDate(summary.start, true)}
            {countries.length ? ` · ${countries.join(", ")}` : ""}
          </span>
        </div>
      </div>

      <div className={styles["tiles"]}>
        <div className={styles["tile"]}>
          <span className="stat-label">Totalt</span>
          <strong className={styles["tile-value"]}>{formatCurrency(summary.total)}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Per dag</span>
          <strong className={styles["tile-value"]}>{formatCurrency(perDay)}</strong>
          {versus !== null ? (
            <span className={`stat-delta ${versus > 0 ? "bad" : "good"}`}>
              {versus === 0
                ? "som de andre turene"
                : `${Math.abs(versus)} % ${versus > 0 ? "over" : "under"} snittet`}
            </span>
          ) : null}
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Dager</span>
          <strong className={styles["tile-value"]}>{summary.days}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">{tag.places.length ? "Steder" : "Kjøp"}</span>
          <strong className={styles["tile-value"]}>
            {tag.places.length || summary.count}
          </strong>
        </div>
      </div>

      {tag.places.length ? (
        <TripMap points={points} active={activeStop} onActive={setActiveStop} />
      ) : (
        <p className={`helper ${styles["nudge"]}`}>
          Legg til byer og land på merkelappen for å se turen på kart, og hva
          hvert stopp kostet. <Link href="/profil/merkelapper">Legg til steder</Link>
        </p>
      )}

      {summary.days > 1 && (
        <TripTimeline
          summary={summary}
          dayStop={itinerary.dayStop}
          stops={itinerary.stops}
          color={stopColor}
          today={today}
          highlight={activeStop}
          onActive={setActiveStop}
        />
      )}

      {itinerary.stops.filter((stop) => stop.days > 0).length > 1 ? (
        <table className={styles["stops"]}>
          <thead>
            <tr>
              <th>Stopp</th>
              <th className="num">Dager</th>
              <th className="num">Brukt</th>
              <th className="num">Per dag</th>
            </tr>
          </thead>
          <tbody>
            {/* A city passed through on the day another took over has no
                days of its own, but it was on the trip. */}
            {itinerary.stops.filter((stop) => stop.days > 0 || stop.place?.arrive).map((stop) => (
              <tr
                key={stop.index}
                className={
                  activeStop !== null && activeStop !== String(stop.index) ? styles["faded"] : ""
                }
                onMouseEnter={() => setActiveStop(String(stop.index))}
                onMouseLeave={() => setActiveStop(null)}
              >
                <td>
                  <span className="breakdown-dot" style={{ background: stopColor(stop) }} />
                  {stop.place?.name ?? "Uten sted"}
                  {stop.place?.kind === "city" ? (
                    <span className="helper"> {stop.place.country}</span>
                  ) : null}
                </td>
                <td className="num">{stop.days || stayLabel(stop)}</td>
                <td className="num">{stop.days ? formatCurrency(stop.spent) : "–"}</td>
                <td className="num">{stop.days ? formatCurrency(Math.round(stop.spent / stop.days)) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className="helper">
        {[
          tags.length > 1 && `${rank}. dyreste av ${tags.length} merkelapper`,
          summary.days > 1 &&
            `Dyreste dag ${shortDate(priciest.date, withYear)} (${formatCurrency(priciest.spent)})`,
        ]
          .filter(Boolean)
          .join(" · ")}
        {!summary.dated && (
          <>
            {tags.length > 1 || summary.days > 1 ? " · " : ""}Datoene er første og siste kjøp.{" "}
            <Link href="/profil/merkelapper">Sett turens datoer</Link>
          </>
        )}
      </p>

      {summary.dated && (
        <div className="stat-row">
          <div className="stat stat-small">
            <span className="stat-label">Før turen</span>
            <strong className="stat-value">{formatCurrency(summary.before)}</strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Under turen</span>
            <strong className="stat-value">{formatCurrency(summary.during)}</strong>
          </div>
          <div className="stat stat-small">
            <span className="stat-label">Etter</span>
            <strong className="stat-value">{formatCurrency(summary.after)}</strong>
          </div>
        </div>
      )}

      {tag.budget != null && (
        <div className={styles["budget"]}>
          <div className={styles["budget-head"]}>
            <span className="stat-label">Budsjett</span>
            <span>
              {formatCurrency(summary.total)} av {formatCurrency(tag.budget)}
              {" · "}
              {over
                ? `${formatCurrency(summary.total - tag.budget)} over`
                : `${formatCurrency(tag.budget - summary.total)} igjen`}
              {summary.dated &&
                ` · ${formatCurrency(Math.round(tag.budget / summary.days))} per dag`}
            </span>
          </div>
          <BulletBar
            fraction={tag.budget > 0 ? summary.total / tag.budget : 1}
            color={over ? "var(--expense)" : "var(--income)"}
            ariaLabel={`${formatCurrency(summary.total)} brukt av et budsjett på ${formatCurrency(tag.budget)}`}
          />
        </div>
      )}

      <CategoryShare byCategory={summary.byCategory} label={tag.name} />

      <div>
        <span className="stat-label">Største kjøp</span>
        <ol className={styles["top"]}>
          {summary.top.map((entry) => (
            <li key={entry.id}>
              <span
                className="breakdown-dot"
                style={{ background: categoryColor(slots.get(entry.category) ?? 1) }}
              />
              <span className={styles["top-item"]}>{entry.item}</span>
              <span className={styles["top-date"]}>{shortDate(entry.date, withYear)}</span>
              <strong>{formatCurrency(entry.amount)}</strong>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/**
 * Several trips at once: every place on one map, coloured and routed per
 * trip, and a table to compare them. Hovering a trip's row (or one of its
 * dots) lights up the whole trip; a click on the row opens it alone.
 */
function TripsOverview({
  summaries,
  onPick,
}: {
  summaries: TagSummary[];
  onPick: (id: number) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  // ponytail: eight slots, so a ninth trip repeats a colour; the table and
  // the hover still tell them apart.
  const tripSlots = useMemo(
    () => categorySlots(summaries.map((row) => String(row.tag.id))),
    [summaries]
  );
  const colorOf = useCallback(
    (id: number) => categoryColor(tripSlots.get(String(id)) ?? 1),
    [tripSlots]
  );

  // Every city, and a trip's countries only where it has no city: one map
  // over many trips is about where, so an undated stop still gets its dot.
  const points = useMemo<MapPoint[]>(
    () =>
      summaries.flatMap((row) => {
        const { stops } = placeStops(row);
        const hasCity = row.tag.places.some((place) => place.kind === "city");
        return stops
          .filter((stop) => stop.place && (stop.place.kind === "city" || !hasCity))
          .map((stop) => {
            const place = stop.place!;
            const color = colorOf(row.tag.id);
            return {
              key: `${row.tag.id}-${stop.index}`,
              group: String(row.tag.id),
              route: place.arrive ? String(row.tag.id) : null,
              lon: place.lon,
              lat: place.lat,
              label: place.name,
              value: stop.spent,
              color,
              title: place.kind === "city" ? `${place.name}, ${place.country}` : place.name,
              rows: [
                { label: row.tag.name, value: formatCurrency(stop.spent), swatch: color },
                {
                  value: stayLabel(stop),
                  tone: "muted" as const,
                },
              ],
              ariaLabel: `${place.name} på ${row.tag.name}: ${formatCurrency(stop.spent)}. Klikk for å zoome inn.`,
            };
          });
      }),
    [summaries, colorOf]
  );

  const total = summaries.reduce((sum, row) => sum + row.total, 0);
  const days = summaries.reduce((sum, row) => sum + row.days, 0);
  const countries = new Set(summaries.flatMap((row) => row.tag.places.map((place) => place.cc)));
  const byCategory = useMemo(() => {
    const merged = new Map<string, number>();
    summaries.forEach((row) =>
      row.byCategory.forEach(({ category, value }) =>
        merged.set(category, (merged.get(category) ?? 0) + value)
      )
    );
    return [...merged]
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [summaries]);
  const rows = [...summaries].sort((a, b) => b.start.localeCompare(a.start));
  const dearest = Math.max(1, ...rows.map((row) => row.total / row.days));
  const first = rows[rows.length - 1].start;
  const last = rows.reduce((max, row) => (row.end > max ? row.end : max), rows[0].end);

  return (
    <>
      <div>
        <span className={styles["when"]}>{tagDates(first, last)}</span>
        <h3 className={styles["hero-name"]}>{summaries.length} reiser</h3>
        <span className="helper">
          {countries.size
            ? [...countries]
                .map((cc) => summaries.flatMap((row) => row.tag.places).find((p) => p.cc === cc)!.country)
                .join(", ")
            : "Ingen steder lagt til ennå"}
        </span>
      </div>

      <div className={styles["tiles"]}>
        <div className={styles["tile"]}>
          <span className="stat-label">Totalt</span>
          <strong className={styles["tile-value"]}>{formatCurrency(total)}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Per dag</span>
          <strong className={styles["tile-value"]}>{formatCurrency(Math.round(total / days))}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Dager</span>
          <strong className={styles["tile-value"]}>{days}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Land</span>
          <strong className={styles["tile-value"]}>{countries.size}</strong>
        </div>
      </div>

      {points.length ? (
        <TripMap points={points} active={active} onActive={setActive} />
      ) : (
        <p className={`helper ${styles["nudge"]}`}>
          Ingen av disse reisene har steder ennå.{" "}
          <Link href="/profil/merkelapper">Legg til steder</Link>
        </p>
      )}

      <table className={styles["stops"]}>
        <thead>
          <tr>
            <th>Reise</th>
            <th className="num">Dager</th>
            <th className="num">Totalt</th>
            <th className={styles["per-day-head"]}>Per dag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const perDay = Math.round(row.total / row.days);
            const over = row.tag.budget != null && row.total > row.tag.budget;
            return (
              <tr
                key={row.tag.id}
                className={`${styles["pickable"]} ${
                  active !== null && active !== String(row.tag.id) ? styles["faded"] : ""
                }`}
                onMouseEnter={() => setActive(String(row.tag.id))}
                onMouseLeave={() => setActive(null)}
                onClick={() => onPick(row.tag.id)}
              >
                <td>
                  <span className="breakdown-dot" style={{ background: colorOf(row.tag.id) }} />
                  <button type="button" className={styles["row-link"]} onClick={() => onPick(row.tag.id)}>
                    {row.tag.name}
                  </button>
                  <span className="helper">
                    {" "}
                    {row.dated ? tagDates(row.start, row.end) : "uten datoer"}
                    {row.tag.budget != null
                      ? ` · ${over ? `${formatCurrency(row.total - row.tag.budget)} over budsjett` : "innenfor budsjett"}`
                      : ""}
                  </span>
                </td>
                <td className="num">{row.days}</td>
                <td className="num">{formatCurrency(row.total)}</td>
                <td>
                  <span className={styles["per-day"]}>
                    <span className={styles["per-day-track"]}>
                      <span
                        style={{
                          width: `${(perDay / dearest) * 100}%`,
                          background: colorOf(row.tag.id),
                        }}
                      />
                    </span>
                    <span className="num">{formatCurrency(perDay)}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <CategoryShare byCategory={byCategory} label={`${summaries.length} reiser`} />
    </>
  );
}
