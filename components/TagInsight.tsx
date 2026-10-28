"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLedger, toLedgerEntries } from "@/components/LedgerProvider";
import { BulletBar, ShareBar } from "@/components/charts";
import Sparkline from "@/components/Sparkline";
import { formatCurrency } from "@/lib/format";
import { keyToRef } from "@/lib/period";
import { shortDate } from "@/lib/periodStats";
import { categoryColor, categorySlots } from "@/lib/categoryColor";
import { tagLabels, tagSummaries } from "@/lib/tags";
import styles from "./TagInsight.module.css";

/**
 * One merkelapp — usually a trip — read as its own period: what it cost, per
 * day, on what, and how the money went day by day. Deliberately not scoped to
 * the period picker, since a trip has its own dates and may straddle a month.
 * With dates set, "per dag" is everything on the trip — tickets bought months
 * ahead included — over the days away, and the day-by-day line starts at what
 * was spent before leaving.
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
  const labels = useMemo(() => tagLabels(ledger.tags), [ledger.tags]);
  const [picked, setPicked] = useState<number | null>(null);
  const summary = tags.find((row) => row.tag.id === picked) ?? tags[0];

  const slots = useMemo(
    () => categorySlots(summary?.byCategory.map((row) => row.category) ?? []),
    [summary]
  );
  const cumulative = useMemo(() => {
    let running = summary?.before ?? 0;
    return summary?.daily.map((day) => (running += day.spent)) ?? [];
  }, [summary]);

  if (!summary) {
    return <div className="empty">Ingen utgifter har en merkelapp ennå.</div>;
  }

  const { tag } = summary;
  const withYear = summary.start.slice(0, 4) !== summary.end.slice(0, 4);
  const rank = [...tags].sort((a, b) => b.total - a.total).indexOf(summary) + 1;
  const priciest = summary.daily.reduce((max, day) => (day.spent > max.spent ? day : max));
  const over = tag.budget != null && summary.total > tag.budget;

  return (
    <div className={styles["body"]}>
      <select
        className={styles["select"]}
        value={tag.id}
        onChange={(e) => setPicked(Number(e.target.value))}
        aria-label="Merkelapp"
      >
        {tags.map((row) => (
          <option key={row.tag.id} value={row.tag.id}>
            {labels.get(row.tag.id) ?? row.tag.name}
          </option>
        ))}
      </select>

      <div className={styles["tiles"]}>
        <div className={styles["tile"]}>
          <span className="stat-label">Totalt</span>
          <strong className={styles["tile-value"]}>{formatCurrency(summary.total)}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Per dag</span>
          <strong className={styles["tile-value"]}>
            {formatCurrency(Math.round(summary.total / summary.days))}
          </strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Dager</span>
          <strong className={styles["tile-value"]}>{summary.days}</strong>
        </div>
        <div className={styles["tile"]}>
          <span className="stat-label">Kjøp</span>
          <strong className={styles["tile-value"]}>{summary.count}</strong>
        </div>
      </div>

      <p className="helper">
        {summary.days > 1
          ? `${shortDate(summary.start, withYear)} – ${shortDate(summary.end, true)}`
          : shortDate(summary.start, true)}
        {tags.length > 1 && ` · ${rank}. dyreste av ${tags.length} merkelapper`}
        {summary.days > 1 &&
          ` · dyreste dag ${shortDate(priciest.date, withYear)} (${formatCurrency(priciest.spent)})`}
        {!summary.dated && (
          <>
            {" · "}Datoene er første og siste kjøp.{" "}
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

      <ShareBar
        segments={summary.byCategory.map((row) => ({
          key: row.category,
          label: row.category,
          value: row.value,
          color: categoryColor(slots.get(row.category) ?? 1),
        }))}
        formatValue={formatCurrency}
        ariaLabel={`${tag.name} fordelt på ${summary.byCategory.length} kategorier`}
      />
      <div className={styles["legend"]}>
        {summary.byCategory.map((row) => (
          <span key={row.category}>
            <span
              className="breakdown-dot"
              style={{ background: categoryColor(slots.get(row.category) ?? 1) }}
            />
            {row.category} <strong>{formatCurrency(row.value)}</strong>
          </span>
        ))}
      </div>

      {summary.days > 1 && (
        <div>
          <span className="stat-label">
            {summary.before ? "Brukt så langt, dag for dag, fra det som var betalt før turen" : "Brukt så langt, dag for dag"}
          </span>
          <Sparkline
            points={cumulative}
            height={64}
            ariaLabel={`Hva ${tag.name} kostet, akkumulert per dag`}
            hover={{
              title: (index) => shortDate(summary.daily[index].date, withYear),
              value: (index) =>
                `${formatCurrency(cumulative[index])} (+${formatCurrency(summary.daily[index].spent)})`,
            }}
          />
        </div>
      )}

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
    </div>
  );
}
