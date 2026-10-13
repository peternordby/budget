"use client";

import { useMemo, useState } from "react";
import { hierarchy, pack } from "d3-hierarchy";
import { ChartTooltip, useMeasure } from "@/components/charts";
import { isSpendingKind } from "@/lib/categories";
import { categoryColor } from "@/lib/categoryColor";
import { formatCurrency } from "@/lib/format";
import type { LedgerEntry } from "@/lib/insights";
import { shortDate } from "@/lib/periodStats";
import styles from "./BubbleChart.module.css";

type Node = { name: string; entry?: LedgerEntry; children?: Node[] };

/**
 * Every purchase in the period as a circle whose area is its amount, packed
 * inside one dashed circle per category. Shows at a glance whether a category
 * is one big bill or a hundred small ones — which a bar of totals hides.
 */
export default function BubbleChart({
  entries,
  multiYear,
  slots,
}: {
  entries: LedgerEntry[];
  multiYear: boolean;
  /** Category -> colour slot, shared with the other charts on the page. */
  slots: Map<string, number>;
}) {
  const colorOf = (category: string) => categoryColor(slots.get(category) ?? 0);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = Math.min(Math.max(width * 0.8, 320), 620);

  const { groups, leaves } = useMemo(() => {
    if (!width) return { groups: [], leaves: [] };
    const byCategory = new Map<string, Node[]>();
    entries.forEach((entry) => {
      if (!isSpendingKind(entry.kind) || entry.amount <= 0) return;
      const list = byCategory.get(entry.category) ?? [];
      list.push({ name: entry.item, entry });
      byCategory.set(entry.category, list);
    });
    const root = hierarchy<Node>({
      name: "root",
      children: [...byCategory].map(([name, children]) => ({ name, children })),
    })
      .sum((node) => node.entry?.amount ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const packed = pack<Node>().size([width, height]).padding((node) => (node.depth === 0 ? 10 : 2))(root);
    return {
      groups: packed.children ?? [],
      leaves: packed.leaves().filter((leaf) => leaf.data.entry),
    };
  }, [entries, width, height]);

  const hovered = active !== null ? leaves[active] : null;

  return (
    <div className={styles["wrap"]} ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 && leaves.length ? (
        <svg width={width} height={height} aria-hidden="true">
          {groups.map((group) => (
            <circle
              key={group.data.name}
              className={styles["group"]}
              cx={group.x}
              cy={group.y}
              r={group.r}
              stroke={colorOf(group.data.name)}
            />
          ))}
          {leaves.map((leaf, index) => {
            const entry = leaf.data.entry!;
            const color = colorOf(entry.category);
            const size = Math.min(15, Math.max(10, leaf.r / 3.4));
            const chars = Math.floor((leaf.r * 1.7) / (size * 0.58));
            const name = entry.item.length > chars ? `${entry.item.slice(0, Math.max(chars - 1, 1))}…` : entry.item;
            return (
              <g key={entry.id} opacity={active === null || active === index ? 1 : 0.45} className={styles["leaf"]}>
                <circle
                  cx={leaf.x}
                  cy={leaf.y}
                  r={leaf.r}
                  fill={`color-mix(in oklab, ${color} 60%, var(--surface-solid))`}
                />
                {leaf.r >= 26 ? (
                  <text className={styles["text"]} x={leaf.x} y={leaf.y} style={{ fontSize: size }}>
                    <tspan x={leaf.x} dy="-0.2em" fontWeight={600}>
                      {name}
                    </tspan>
                    <tspan x={leaf.x} dy="1.3em" style={{ fontSize: size * 0.85 }}>
                      {formatCurrency(entry.amount)}
                    </tspan>
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : width > 0 ? (
        <div className="empty">Ingen utgifter i perioden.</div>
      ) : (
        <div style={{ height: 320 }} />
      )}
      {leaves.map((leaf, index) => {
        const entry = leaf.data.entry!;
        return (
          <div
            key={entry.id}
            role="img"
            tabIndex={0}
            className={styles["hit"]}
            style={{ left: leaf.x - leaf.r, top: leaf.y - leaf.r, width: leaf.r * 2, height: leaf.r * 2 }}
            aria-label={`${entry.item}, ${entry.category}: ${formatCurrency(entry.amount)}`}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          />
        );
      })}
      <ChartTooltip
        content={
          hovered
            ? {
                x: hovered.x,
                y: hovered.y - hovered.r,
                boxWidth: width,
                title: hovered.data.entry!.item,
                rows: [
                  {
                    label: hovered.data.entry!.category,
                    value: formatCurrency(hovered.data.entry!.amount),
                    swatch: colorOf(hovered.data.entry!.category),
                  },
                  { value: shortDate(hovered.data.entry!.date, multiYear), tone: "muted" },
                ],
              }
            : null
        }
      />
      {groups.length ? (
        <div className={styles["legend"]}>
          {groups.map((group) => (
            <span key={group.data.name} className={styles["legend-item"]}>
              <span
                className="breakdown-dot"
                style={{ background: colorOf(group.data.name) }}
              />
              {group.data.name}
              <span className="num helper">{formatCurrency(group.value ?? 0)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
