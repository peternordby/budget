"use client";

import { useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  anomalyKey,
  detectAnomalies,
  type Anomaly,
  type LedgerEntry,
  type MonthRef,
} from "@/lib/insights";
import styles from "./Anomalies.module.css";

type AnomaliesProps = {
  entries: LedgerEntry[];
  selected: MonthRef | null;
  periodLabel: string;
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
  }
}

export default function Anomalies({
  entries,
  selected,
  periodLabel,
}: AnomaliesProps) {
  const anomalies = useMemo(
    () => (selected ? detectAnomalies(entries, selected) : []),
    [entries, selected]
  );

  return (
    <section className="card section-gap">
      <div className="activity-head">
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
