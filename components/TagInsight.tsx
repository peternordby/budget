"use client";

import { useEffect, useMemo, useState } from "react";
import { useLedger, toLedgerEntries } from "@/components/LedgerProvider";
import { ShareBar } from "@/components/charts";
import Sparkline from "@/components/Sparkline";
import { formatCurrency } from "@/lib/format";
import { keyToRef } from "@/lib/period";
import { shortDate } from "@/lib/periodStats";
import { categoryColor, categorySlots } from "@/lib/categoryColor";
import { tagSummaries } from "@/lib/tags";
import styles from "./TagInsight.module.css";

/**
 * One merkelapp — usually a trip — read as its own period: what it cost, per
 * day, on what, and how the money went day by day. Deliberately not scoped to
 * the period picker, since a trip has its own dates and may straddle a month.
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

  const tags = useMemo(() => tagSummaries(toLedgerEntries(ledger.expenses)), [ledger.expenses]);
  const [picked, setPicked] = useState<string | null>(null);
  const summary = tags.find((tag) => tag.tag === picked) ?? tags[0];

  const slots = useMemo(
    () => categorySlots(summary?.byCategory.map((row) => row.category) ?? []),
    [summary]
  );
  const cumulative = useMemo(() => {
    let running = 0;
    return summary?.daily.map((day) => (running += day.spent)) ?? [];
  }, [summary]);

  if (!summary) {
    return <div className="empty">Ingen utgifter har en merkelapp ennå.</div>;
  }

  const withYear = summary.first.slice(0, 4) !== summary.last.slice(0, 4);
  const rank = [...tags].sort((a, b) => b.total - a.total).indexOf(summary) + 1;
  const priciest = summary.daily.reduce((max, day) => (day.spent > max.spent ? day : max));

  return (
    <div className={styles["body"]}>
      <select
        className={styles["select"]}
        value={summary.tag}
        onChange={(e) => setPicked(e.target.value)}
        aria-label="Merkelapp"
      >
        {tags.map((tag) => (
          <option key={tag.tag} value={tag.tag}>
            {tag.tag}
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
          ? `${shortDate(summary.first, withYear)} – ${shortDate(summary.last, true)}`
          : shortDate(summary.first, true)}
        {tags.length > 1 && ` · ${rank}. dyreste av ${tags.length} merkelapper`}
        {summary.days > 1 &&
          ` · dyreste dag ${shortDate(priciest.date, withYear)} (${formatCurrency(priciest.spent)})`}
      </p>

      <ShareBar
        segments={summary.byCategory.map((row) => ({
          key: row.category,
          label: row.category,
          value: row.value,
          color: categoryColor(slots.get(row.category) ?? 1),
        }))}
        formatValue={formatCurrency}
        ariaLabel={`${summary.tag} fordelt på ${summary.byCategory.length} kategorier`}
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
          <span className="stat-label">Brukt så langt, dag for dag</span>
          <Sparkline
            points={cumulative}
            height={64}
            ariaLabel={`Hva ${summary.tag} kostet, akkumulert per dag`}
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
