"use client";

import { useMemo, useState } from "react";
import { ChartTooltip, bandLayout, barCorner, scaleLinear, useMeasure } from "@/components/charts";
import { categoryColor } from "@/lib/categoryColor";
import { formatCurrency } from "@/lib/format";
import type { LedgerEntry } from "@/lib/insights";
import { incomeWaterfall, kiloAmount } from "@/lib/periodStats";
import chartStyles from "./charts.module.css";
import styles from "./Waterfall.module.css";

const HEIGHT = 280;
const TOP = 22; // room for the value over the tallest bar
const BOTTOM = 26; // the category labels

/**
 * Income on the left, each spending category taking its bite, what is left on
 * the right. Every step hangs from the previous one's bottom, joined by a
 * dashed line, so the eye can walk the money down.
 */
export default function Waterfall({
  entries,
  slots,
}: {
  entries: LedgerEntry[];
  /** Category -> colour slot, shared with the other charts on the page. */
  slots: Map<string, number>;
}) {
  const steps = useMemo(() => incomeWaterfall(entries), [entries]);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  if (!steps.length) {
    return <div className="empty">Ingen inntekt registrert i perioden.</div>;
  }

  const income = steps[0].value;
  const low = Math.min(0, ...steps.map((step) => step.to));
  const y = scaleLinear().domain([low, income]).range([HEIGHT - BOTTOM, TOP]);
  const band = bandLayout(steps.length, width, 0.22);
  const colorOf = (index: number) => {
    const step = steps[index];
    if (step.kind === "spend") return categoryColor(slots.get(step.label) ?? 0);
    return step.kind === "rest" && step.to < 0 ? "var(--expense)" : "var(--income)";
  };
  const hovered = active !== null ? steps[active] : null;
  // Labels only fit when a column is wide enough for a word; below that the
  // tooltip and the hit area's aria-label carry the name.
  const showLabels = band.step >= 46;

  return (
    <div className={styles["wrap"]} ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} aria-hidden="true">
          <line className={chartStyles["grid"]} x1={0} x2={width} y1={y(0)} y2={y(0)} />
          {steps.map((step, index) => {
            const top = y(Math.max(step.from, step.to));
            const bottom = y(Math.min(step.from, step.to));
            const x = band.center(index) - band.bar / 2;
            const next = steps[index + 1];
            return (
              <g key={step.key} opacity={active === null || active === index ? 1 : 0.4}>
                <rect
                  x={x}
                  y={top}
                  width={band.bar}
                  height={Math.max(bottom - top, 2)}
                  {...barCorner(Math.min(band.bar, Math.max(bottom - top, 2)) / 2)}
                  fill={colorOf(index)}
                />
                {next ? (
                  <line
                    className={styles["connector"]}
                    x1={x + band.bar}
                    x2={band.center(index + 1) - band.bar / 2}
                    y1={y(step.to)}
                    y2={y(step.to)}
                  />
                ) : null}
                <text className={styles["value"]} x={band.center(index)} y={top - 6}>
                  {kiloAmount(step.value)}
                </text>
                {showLabels ? (
                  <text className={styles["label"]} x={band.center(index)} y={HEIGHT - 8}>
                    {step.label.length > band.step / 7 ? `${step.label.slice(0, Math.floor(band.step / 7) - 1)}…` : step.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      {width > 0
        ? steps.map((step, index) => (
            <div
              key={step.key}
              role="img"
              tabIndex={0}
              className={styles["hit"]}
              style={{ left: band.left(index), width: band.step, height: HEIGHT }}
              aria-label={`${step.label}: ${formatCurrency(step.value)}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            />
          ))
        : null}
      <ChartTooltip
        content={
          hovered && active !== null
            ? {
                x: band.center(active),
                y: y(Math.max(hovered.from, hovered.to)),
                boxWidth: width,
                title: hovered.label,
                rows: [
                  { value: formatCurrency(hovered.value), swatch: colorOf(active) },
                  {
                    label: "av inntekten",
                    value: `${Math.round((hovered.value / income) * 100)} %`,
                    tone: "muted",
                  },
                ],
              }
            : null
        }
      />
    </div>
  );
}
