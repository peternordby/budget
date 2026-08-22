"use client";

import { useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  anomalyKey,
  detectAnomalies,
  monthKey,
  type Anomaly,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import type { RecurringTemplate } from "@/lib/recurring";
import { missingFixedRef, useDismissals } from "@/lib/dismissals";
import styles from "./Anomalies.module.css";

type AnomaliesProps = {
  entries: LedgerEntry[];
  selected: MonthRef | null;
  periodLabel: string;
  templates: RecurringTemplate[];
};

function formatRatio(ratio: number) {
  return ratio.toFixed(1).replace(".", ",");
}

function describeAnomaly(anomaly: Anomaly): {
  title: string;
  detail: string;
  amount: number;
} {
  switch (anomaly.kind) {
    case "large-transaction":
      return {
        title: `Stor enkeltutgift: ${anomaly.entry.item}`,
        detail: `${formatRatio(anomaly.ratio)}× medianen for ${anomaly.entry.category} (median ${formatCurrency(anomaly.median)}), registrert ${formatDate(anomaly.entry.date)}.`,
        amount: anomaly.entry.amount,
      };
    case "category-spike":
      return {
        title: `Uvanlig høyt forbruk i ${anomaly.category}`,
        detail: `Normalt ligger måneden på rundt ${formatCurrency(Math.round(anomaly.average))} – nå ${formatRatio(anomaly.ratio)}× snittet for de siste 12 månedene.`,
        amount: anomaly.current,
      };
    case "new-category":
      return {
        title: `Ny kategori: ${anomaly.category}`,
        detail:
          "Første registrerte utgift i denne kategorien de siste 12 månedene.",
        amount: anomaly.total,
      };
    case "duplicate":
      return {
        title: `Mulig duplikat: ${anomaly.item}`,
        detail: `${anomaly.count} identiske transaksjoner registrert ${formatDate(anomaly.date)}. Sjekk om noe er ført dobbelt.`,
        amount: anomaly.amount,
      };
    case "missing-fixed":
      return {
        title: `Mangler fast utgift: ${anomaly.item}`,
        detail:
          "Forfallsdagen er passert, men utgiften er ikke ført denne måneden.",
        amount: anomaly.amount,
      };
  }
}

export default function Anomalies({
  entries,
  selected,
  periodLabel,
  templates,
}: AnomaliesProps) {
  const { isDismissed } = useDismissals();

  // Which fixed expenses are *due* is a calendar question, answered here so
  // detectAnomalies stays pure. A template counts as due only once its day of
  // the month has passed, and only for a month that is not still ahead of us —
  // otherwise every active template would be reported as missing on the 1st.
  const expectedFixed = useMemo(() => {
    if (!selected) return [];
    const now = new Date();
    const isCurrentMonth =
      selected.year === now.getFullYear() && selected.month === now.getMonth() + 1;
    const isPastMonth =
      selected.year < now.getFullYear() ||
      (selected.year === now.getFullYear() && selected.month < now.getMonth() + 1);
    if (!isCurrentMonth && !isPastMonth) return [];

    const periodKey = monthKey(selected.year, selected.month);
    return templates
      .filter((template) => template.active)
      .filter((template) => !isCurrentMonth || template.day_of_month <= now.getDate())
      // Templates the user has said do not belong to this month drop out here,
      // so this card and RecurringPanel's "N mangler" badge always agree.
      .filter(
        (template) => !isDismissed("missing-fixed", missingFixedRef(template.id, periodKey))
      )
      .map((template) => ({ item: template.item, amount: template.price }));
  }, [selected, templates, isDismissed]);

  const anomalies = useMemo(
    () => (selected ? detectAnomalies(entries, selected, expectedFixed) : []),
    [entries, selected, expectedFixed]
  );

  return (
    <section className="card section-gap">
      <div className="card-head">
        <h2 className="section-title">Avvik</h2>
        <span className="helper">
          {selected ? periodLabel : "Velg en måned"}
        </span>
      </div>
      {!selected ? (
        <div className="empty">
          Velg år og måned for å lete etter avvik i forbruket.
        </div>
      ) : anomalies.length === 0 ? (
        <div className="empty">
          Ingen avvik oppdaget i {periodLabel}. Forbruket ser ut som det
          pleier.
        </div>
      ) : (
        <div className={styles["anomaly-list"]}>
          {anomalies.map((anomaly) => {
            const { title, detail, amount } = describeAnomaly(anomaly);
            return (
              <div
                key={anomalyKey(anomaly)}
                className={`${styles["anomaly-row"]} ${styles[`anomaly-${anomaly.severity}`]}`}
              >
                <span className={styles["anomaly-dot"]} aria-hidden="true" />
                <div className={styles["anomaly-body"]}>
                  <span className={styles["anomaly-title"]}>{title}</span>
                  <span className={styles["anomaly-detail"]}>{detail}</span>
                </div>
                <span className={styles["anomaly-amount"]}>
                  {formatCurrency(amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
