"use client";

import { useId, useMemo, type CSSProperties } from "react";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
} from "@/lib/format";
import { categoryHues } from "@/lib/categoryColor";
import { IconChevronDown, IconChevronUp } from "@/components/icons";
import { bandShapes, datePositions, type StackedChart } from "@/lib/savings";
import styles from "./StackedAreaChart.module.css";

// The SVG holds shapes only, stretched to its box with preserveAspectRatio
//="none" so the chart's height is set in CSS independently of its width. All
// text is HTML positioned over the same box in percentages: text inside a
// non-uniformly scaled viewBox is squashed, badly so on a phone, where the
// horizontal scale is a third of the vertical one.
const VIEW_W = 1000;
const VIEW_H = 320;

// Smallest horizontal gap between two date labels, as a fraction of the plot.
// Snapshot dates cluster (four in one month, then a year's silence), so
// thinning has to go by position rather than by every nth date.
const MIN_LABEL_GAP = 0.085;

type StackedAreaChartProps = {
  chart: StackedChart;
  /** Index into chart.dates the user is pointing at, or null. */
  hoverIndex: number | null;
  onHoverIndex: (index: number | null) => void;
};

/**
 * Round gridline values covering 0..max.
 *
 * Picks the smallest "nice" step (1, 2, 2.5 or 5 times a power of ten) that
 * covers the data in at most MAX_INTERVALS bands. Choosing the step from
 * `max / 3` instead used to jump a whole magnitude — a 205 600 max landed on a
 * 100 000 step and a 300 000 top gridline, leaving a third of the plot empty.
 */
const MAX_INTERVALS = 5;

export function axisTicks(max: number): number[] {
  if (max <= 0) return [0];

  const magnitude = 10 ** Math.floor(Math.log10(max));
  const candidates: number[] = [];
  for (const scale of [magnitude / 100, magnitude / 10, magnitude, magnitude * 10]) {
    for (const multiple of [1, 2, 2.5, 5]) candidates.push(scale * multiple);
  }
  candidates.sort((a, b) => a - b);

  const step =
    candidates.find(
      (candidate) => candidate > 0 && Math.ceil(max / candidate) <= MAX_INTERVALS
    ) ?? max;

  const intervals = Math.max(1, Math.ceil(max / step));
  const ticks: number[] = [];
  for (let i = 0; i <= intervals; i += 1) ticks.push(Math.round(i * step));
  return ticks;
}

/** Compact axis label: 124 500 -> "125k", 1 240 000 -> "1,2M". */
export function shortAmount(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toFixed(millions < 10 ? 1 : 0).replace(".", ",")}M`;
  }
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

/**
 * Which dates to label: the first, the last, and as many in between as fit
 * without colliding. The last is non-negotiable, so anything too close to it
 * is dropped rather than allowed to overlap it.
 */
export function labelledDates(fractions: number[]): number[] {
  if (fractions.length <= 1) return fractions.map((_, index) => index);

  const kept = [0];
  const last = fractions.length - 1;
  for (let i = 1; i < last; i += 1) {
    if (fractions[i] - fractions[kept[kept.length - 1]] >= MIN_LABEL_GAP) {
      kept.push(i);
    }
  }
  while (
    kept.length &&
    fractions[last] - fractions[kept[kept.length - 1]] < MIN_LABEL_GAP
  ) {
    kept.pop();
  }
  kept.push(last);
  return kept;
}

export default function StackedAreaChart({
  chart,
  hoverIndex,
  onHoverIndex,
}: StackedAreaChartProps) {
  const gradientId = useId();
  const { dates, bands, totals, max } = chart;

  const hues = useMemo(
    () => categoryHues(bands.map((band) => band.category)),
    [bands]
  );

  // 0..1 across the plot. A lone snapshot sits mid-plot rather than pinned to
  // the left edge, where it would read as clipped.
  const fractions = useMemo(() => {
    if (dates.length === 1) return [0.5];
    return datePositions(dates);
  }, [dates]);

  const xs = useMemo(
    () => fractions.map((fraction) => fraction * VIEW_W),
    [fractions]
  );

  const ticks = useMemo(() => axisTicks(max), [max]);
  // Scale to the topmost gridline rather than to the data, so the top tick
  // lands exactly on the top of the plot. Scaling to `max` instead put any
  // tick above it at a negative offset, where its label floated out of the
  // chart and collided with the card heading — and left the total line
  // touching the top edge with no headroom.
  const scaleMax = ticks[ticks.length - 1] || 1;
  const y = (value: number) => VIEW_H - (value / scaleMax) * VIEW_H;
  const labelled = useMemo(() => labelledDates(fractions), [fractions]);

  // A single date has no width to fill, so bands are drawn as marks rather
  // than as zero-width polygons.
  const singlePoint = dates.length === 1;

  if (!dates.length) return null;

  const swatchOf = (category: string) =>
    `hsl(${hues.get(category) ?? 0} var(--seg-s) var(--seg-l))`;
  const edgeOf = (category: string) =>
    `hsl(${hues.get(category) ?? 0} var(--seg-s) calc(var(--seg-l) - 14%))`;
  const gradientOf = (category: string) =>
    `${gradientId}-${(hues.get(category) ?? 0).toString(36)}`;

  return (
    <div className={styles["wrap"]}>
      <div className={styles["plot"]}>
        {/* Value axis, in the gutter to the left of the plot box. */}
        {ticks.map((tick) => (
          <span
            key={`y-${tick}`}
            className={styles["y-label"]}
            style={{ top: `${(1 - tick / scaleMax) * 100}%` }}
          >
            {shortAmount(tick)}
          </span>
        ))}

        <svg
          className={styles["chart"]}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Sparing fordelt på ${bands.length} kategorier, ${formatDate(
            dates[0]
          )} til ${formatDate(dates[dates.length - 1])}. Total nå ${formatCurrency(
            totals[totals.length - 1]
          )}.`}
          onMouseLeave={() => onHoverIndex(null)}
        >
          <defs>
            {bands.map((band) => (
              <linearGradient
                key={band.category}
                id={gradientOf(band.category)}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={swatchOf(band.category)}
                  stopOpacity="0.95"
                />
                <stop
                  offset="100%"
                  stopColor={swatchOf(band.category)}
                  stopOpacity="0.6"
                />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((tick) => (
            <line
              key={`grid-${tick}`}
              className={styles["grid"]}
              x1={0}
              x2={VIEW_W}
              y1={y(tick)}
              y2={y(tick)}
            />
          ))}

          {/* Bottom of the stack first, so later bands paint over earlier. */}
          {bands.map((band) => {
            const shapes = bandShapes(band);
            return (
              <g key={band.category}>
                <title>{`${band.category}: ${formatCurrency(band.latest)} per ${formatDate(band.latestDate)}`}</title>
                {shapes.map((shape) => {
                  const observed = shape.filter((point) => !point.anchor);

                  if (singlePoint || observed.length === 1) {
                    // Nothing to sweep between: draw the one observation as a
                    // tick so a category seen exactly once is still visible.
                    const only = observed[0];
                    if (!only || only.upper === only.lower) return null;
                    return (
                      <line
                        key={`mark-${only.index}`}
                        className={styles["point-mark"]}
                        x1={xs[only.index]}
                        x2={xs[only.index]}
                        y1={y(only.lower)}
                        y2={y(only.upper)}
                        stroke={edgeOf(band.category)}
                      />
                    );
                  }

                  const top = shape
                    .map((point) => `${xs[point.index]},${y(point.upper)}`)
                    .join(" ");
                  const bottom = [...shape]
                    .reverse()
                    .map((point) => `${xs[point.index]},${y(point.lower)}`)
                    .join(" ");
                  // The visible upper edge stops at the real observations —
                  // an anchor is a drawing device, not a measured value, and
                  // stroking through it would draw a line down to the
                  // baseline that looks like data.
                  const edge = observed
                    .map((point) => `${xs[point.index]},${y(point.upper)}`)
                    .join(" ");

                  return (
                    <g key={`seg-${shape[0].index}-${shape[shape.length - 1].index}`}>
                      <polygon
                        className={styles["band"]}
                        points={`${top} ${bottom}`}
                        fill={`url(#${gradientOf(band.category)})`}
                      />
                      {/* The band's own upper edge, so two neighbours stay
                          separable even where their fills are close. */}
                      <polyline
                        className={styles["band-edge"]}
                        points={edge}
                        stroke={edgeOf(band.category)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* The top of the stack, drawn once so the overall shape reads even
              where a band boundary is faint. */}
          {!singlePoint ? (
            <polyline
              className={styles["total-line"]}
              points={totals
                .map((total, index) => `${xs[index]},${y(total)}`)
                .join(" ")}
            />
          ) : null}

          {hoverIndex !== null && xs[hoverIndex] !== undefined ? (
            <g>
              <line
                className={styles["guide"]}
                x1={xs[hoverIndex]}
                x2={xs[hoverIndex]}
                y1={0}
                y2={VIEW_H}
              />
              <circle
                className={styles["guide-dot"]}
                cx={xs[hoverIndex]}
                cy={y(totals[hoverIndex])}
                r={5}
              />
            </g>
          ) : null}

          {/* Hit areas last, so they sit above the painted bands. Each spans
              the midpoints to its neighbours, so pointing anywhere picks the
              nearest snapshot rather than only its exact pixel. */}
          {dates.map((date, index) => {
            const left =
              index === 0 ? 0 : (xs[index - 1] + xs[index]) / 2;
            const right =
              index === dates.length - 1
                ? VIEW_W
                : (xs[index] + xs[index + 1]) / 2;
            return (
              <rect
                key={`hit-${date}`}
                className={styles["hit"]}
                x={left}
                y={0}
                width={Math.max(right - left, 1)}
                height={VIEW_H}
                onMouseEnter={() => onHoverIndex(index)}
              />
            );
          })}
        </svg>

      {/* Tooltip. HTML rather than SVG for the same reason the axis labels are:
          text inside the stretched viewBox is squashed. Positioned off the
          same 0..1 fractions, so it tracks the guide exactly. */}
      {hoverIndex !== null && fractions[hoverIndex] !== undefined ? (
        <div
          className={styles["tooltip"]}
          // A tooltip centred on the guide would hang off the plot at either
          // end, so the outer fifths anchor to their own edge instead.
          data-side={
            fractions[hoverIndex] > 0.8
              ? "right"
              : fractions[hoverIndex] < 0.2
                ? "left"
                : "center"
          }
          style={
            {
              left: `${fractions[hoverIndex] * 100}%`,
              // Sits above the total line, unless that would push it out of
              // the top of the plot, in which case it drops below.
              top: `${(1 - totals[hoverIndex] / scaleMax) * 100}%`,
            } as CSSProperties
          }
          data-flip={
            totals[hoverIndex] / scaleMax > 0.75 ? "below" : "above"
          }
          role="status"
          aria-live="polite"
        >
          <span className={styles["tooltip-date"]}>
            {formatDate(dates[hoverIndex])}
          </span>
          <strong className={styles["tooltip-total"]}>
            {formatCurrency(totals[hoverIndex])}
          </strong>
          {hoverIndex > 0 ? (
            <span
              className={`${styles["tooltip-change"]} ${
                totals[hoverIndex] - totals[hoverIndex - 1] >= 0
                  ? "text-income"
                  : "text-expense"
              }`}
            >
              {formatSignedCurrency(
                totals[hoverIndex] - totals[hoverIndex - 1]
              )}{" "}
              <span className="helper">
                fra {formatDate(dates[hoverIndex - 1])}
              </span>
            </span>
          ) : (
            <span className={`${styles["tooltip-change"]} helper`}>
              Første registrering
            </span>
          )}
        </div>
      ) : null}
      </div>

      <div className={styles["x-axis"]}>
        {labelled.map((index) => (
          <span
            key={`x-${index}`}
            className={`${styles["x-label"]} ${
              hoverIndex === index ? styles["x-label-active"] : ""
            }`}
            style={
              {
                left: `${fractions[index] * 100}%`,
                // The end labels would otherwise hang outside the plot.
                transform:
                  index === 0 && fractions[index] < 0.02
                    ? "translateX(0)"
                    : index === dates.length - 1 && fractions[index] > 0.98
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              } as CSSProperties
            }
          >
            {formatDate(dates[index])}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The legend, which doubles as the readout: it shows each category's value at
 * the hovered date (or its latest value when nothing is hovered), and owns the
 * controls that reorder the stack.
 */
type LegendProps = {
  chart: StackedChart;
  hoverIndex: number | null;
  onMove: (category: string, direction: -1 | 1) => void;
  onDrop: (dragged: string, target: string) => void;
  dragging: string | null;
  dragTarget: string | null;
  onDragState: (dragging: string | null, target: string | null) => void;
};

export function StackedAreaLegend({
  chart,
  hoverIndex,
  onMove,
  onDrop,
  dragging,
  dragTarget,
  onDragState,
}: LegendProps) {
  const hues = useMemo(
    () => categoryHues(chart.bands.map((band) => band.category)),
    [chart.bands]
  );

  // Bottom-of-stack first in the data; the legend lists top-of-stack first so
  // its rows run in the same direction as the chart reads from the top down.
  const rows = useMemo(() => [...chart.bands].reverse(), [chart.bands]);

  return (
    <div className={styles["legend"]}>
      <div className={styles["legend-head"]}>
        <span />
        <span>Kategori</span>
        <span className="num">
          {hoverIndex !== null ? formatDate(chart.dates[hoverIndex]) : "Nå"}
        </span>
        <span className="num">Endring</span>
        <span>Rekkefølge</span>
      </div>

      {rows.map((band, rowIndex) => {
        const value =
          hoverIndex !== null ? band.values[hoverIndex] : band.latest;
        // At a hovered date, the change is against the previous timeline date —
        // which is what the guide is sitting between. Null when either side is
        // missing, rather than treating an absent category as 0.
        const change =
          hoverIndex !== null
            ? hoverIndex > 0 &&
              band.values[hoverIndex] !== null &&
              band.values[hoverIndex - 1] !== null
              ? (band.values[hoverIndex] as number) -
                (band.values[hoverIndex - 1] as number)
              : null
            : band.change;

        return (
          <div
            key={band.category}
            className={`${styles["legend-row"]} ${
              dragging === band.category ? styles["is-dragging"] : ""
            } ${
              dragTarget === band.category &&
              dragging &&
              dragging !== band.category
                ? styles["is-drop-target"]
                : ""
            }`}
            draggable
            onDragStart={(event) => {
              onDragState(band.category, null);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => onDragState(null, null)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onDragState(dragging, band.category);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging) onDrop(dragging, band.category);
              onDragState(null, null);
            }}
            title="Dra for å endre rekkefølgen i grafen"
          >
            <span
              className={styles["swatch"]}
              style={
                {
                  background: `hsl(${hues.get(band.category) ?? 0} var(--seg-s) var(--seg-l))`,
                } as CSSProperties
              }
            />
            <span className={styles["legend-name"]}>
              <span className={styles["legend-name-text"]}>
                {band.category}
              </span>
              {band.stale ? (
                <span
                  className={styles["stale"]}
                  title={`Sist registrert ${formatDate(band.lastObserved)}. Verdien videreføres i grafen fram til i dag.`}
                >
                  sist {formatDate(band.lastObserved)}
                </span>
              ) : null}
            </span>
            <strong className="num">
              {value === null ? "—" : formatCurrency(value)}
            </strong>
            <span
              className={`num ${
                change === null
                  ? "helper"
                  : change >= 0
                    ? "text-income"
                    : "text-expense"
              }`}
            >
              {change === null
                ? "—"
                : `${change >= 0 ? "+" : "-"}${formatCurrency(Math.abs(change))}`}
            </span>
            <span className={`field-move ${styles["legend-move"]}`}>
              <button
                className="icon-btn icon-btn-sm"
                type="button"
                onClick={() => onMove(band.category, -1)}
                disabled={rowIndex === 0}
                aria-label={`Flytt ${band.category} opp`}
                title="Flytt opp"
              >
<IconChevronUp />
              </button>
              <button
                className="icon-btn icon-btn-sm"
                type="button"
                onClick={() => onMove(band.category, 1)}
                disabled={rowIndex === rows.length - 1}
                aria-label={`Flytt ${band.category} ned`}
                title="Flytt ned"
              >
<IconChevronDown />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
