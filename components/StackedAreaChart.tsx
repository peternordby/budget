"use client";

/**
 * The /sparing stacked area chart: one band per savings category, stacked, with
 * the total drawn on top.
 *
 * It measures its own width and draws in real pixels, so the axis labels are
 * plain `<text>` inside the SVG. They used to be HTML positioned in
 * percentages over a `preserveAspectRatio="none"` viewBox, because text inside
 * a non-uniformly scaled box is squashed — badly on a phone, where the
 * horizontal scale was a third of the vertical one. Measuring removed that
 * whole layer, and the value-axis gutter with it.
 *
 * The scale and label maths live in `lib/chart.ts`; band geometry (including
 * the carry-forward anchors) in `lib/savings.ts`.
 */

import { useId, useMemo, type CSSProperties } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
} from "@/lib/format";
import { categoryColor, categorySlots } from "@/lib/categoryColor";
import { IconChevronDown, IconChevronUp } from "@/components/icons";
import { bandShapes, datePositions, type StackedChart } from "@/lib/savings";
import { axisTicks, labelledDates, shortAmount } from "@/lib/chart";
import { ChartTooltip, GridLines, useMeasure } from "@/components/charts";
import { T_DRAW, T_FAST } from "@/lib/motion";
import kit from "@/components/charts.module.css";
import styles from "./StackedAreaChart.module.css";

const HEIGHT = 300;
const LABEL_BAND = 20;

type StackedAreaChartProps = {
  chart: StackedChart;
  /** Index into chart.dates the user is pointing at, or null. */
  hoverIndex: number | null;
  onHoverIndex: (index: number | null) => void;
};

export default function StackedAreaChart({
  chart,
  hoverIndex,
  onHoverIndex,
}: StackedAreaChartProps) {
  const gradientId = useId().replace(/[^\w-]/g, "");
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { dates, bands, totals, max } = chart;

  const slots = useMemo(
    () => categorySlots(bands.map((band) => band.category)),
    [bands]
  );

  // 0..1 across the plot. A lone snapshot sits mid-plot rather than pinned to
  // the left edge, where it would read as clipped.
  const fractions = useMemo(() => {
    if (dates.length === 1) return [0.5];
    return datePositions(dates);
  }, [dates]);

  const xs = useMemo(
    () => fractions.map((fraction) => fraction * width),
    [fractions, width]
  );

  const ticks = useMemo(() => axisTicks(max), [max]);
  // Scale to the topmost gridline rather than to the data, so the top tick
  // lands exactly on the top of the plot. Scaling to `max` instead put any
  // tick above it at a negative offset, where its label floated out of the
  // chart, and left the total line touching the top edge with no headroom.
  const scaleMax = ticks[ticks.length - 1] || 1;
  const y = useMemo(
    () => scaleLinear().domain([0, scaleMax]).range([HEIGHT, 0]),
    [scaleMax]
  );
  const labelled = useMemo(() => labelledDates(fractions), [fractions]);

  // A single date has no width to fill, so bands are drawn as marks rather
  // than as zero-width polygons.
  const singlePoint = dates.length === 1;

  if (!dates.length) return null;

  const swatchOf = (category: string) => categoryColor(slots.get(category) ?? 0);
  // A step off the fill, so a band's own upper edge separates it from the one
  // above without a border being drawn round the mark. Mixed towards `--ink`,
  // which darkens it in the light theme and lightens it in the dark one — in
  // both cases away from the fill.
  const edgeOf = (category: string) =>
    `color-mix(in oklab, ${swatchOf(category)} 78%, var(--ink))`;
  const gradientOf = (category: string) =>
    `${gradientId}-${slots.get(category) ?? 0}`;

  const bandArea = area<{ index: number; upper: number; lower: number }>()
    .x((point) => xs[point.index])
    .y0((point) => y(point.lower))
    .y1((point) => y(point.upper))
    .curve(curveMonotoneX);
  const edgeLine = line<{ index: number; upper: number }>()
    .x((point) => xs[point.index])
    .y((point) => y(point.upper))
    .curve(curveMonotoneX);

  return (
    <div className={styles["wrap"]}>
      <div className={styles["plot"]} ref={ref}>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT + LABEL_BAND}
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
                  {/* A wash, not a saturated block: six stacked bands at 95 %
                      opacity read as loud blocks of poster paint, and the total
                      line and gridlines disappear into them. */}
                  <stop
                    offset="0%"
                    stopColor={swatchOf(band.category)}
                    stopOpacity="0.72"
                  />
                  <stop
                    offset="100%"
                    stopColor={swatchOf(band.category)}
                    stopOpacity="0.4"
                  />
                </linearGradient>
              ))}
            </defs>

            <GridLines ticks={ticks} y={y} width={width} format={shortAmount} />

            {/* Bottom of the stack first, so later bands paint over earlier. */}
            {bands.map((band) => {
              const shapes = bandShapes(band);
              return (
                <g key={band.category}>
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

                    return (
                      <g key={`seg-${shape[0].index}-${shape[shape.length - 1].index}`}>
                        <motion.path
                          className={styles["band"]}
                          d={bandArea(shape) ?? ""}
                          fill={`url(#${gradientOf(band.category)})`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={T_DRAW}
                        />
                        {/* The band's own upper edge, so two neighbours stay
                            separable even where their fills are close. It stops
                            at the real observations — an anchor is a drawing
                            device, not a measured value, and stroking through
                            it would draw a line down to the baseline that looks
                            like data. */}
                        <path
                          className={styles["band-edge"]}
                          d={edgeLine(observed) ?? ""}
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
              <motion.path
                className={styles["total-line"]}
                d={
                  line<number>()
                    .x((_, index) => xs[index])
                    .y((total) => y(total))
                    .curve(curveMonotoneX)(totals) ?? ""
                }
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={T_DRAW}
              />
            ) : null}

            {hoverIndex !== null && xs[hoverIndex] !== undefined ? (
              <g>
                <line
                  className={styles["guide"]}
                  x1={xs[hoverIndex]}
                  x2={xs[hoverIndex]}
                  y1={0}
                  y2={HEIGHT}
                />
                <motion.circle
                  className={styles["guide-dot"]}
                  cx={xs[hoverIndex]}
                  cy={y(totals[hoverIndex])}
                  initial={{ r: 0 }}
                  animate={{ r: 5 }}
                  transition={T_FAST}
                />
              </g>
            ) : null}

            {labelled.map((index) => (
              <text
                key={`x-${index}`}
                className={`${kit["axis-label"]} ${
                  hoverIndex === index ? kit["axis-label-active"] : ""
                }`}
                x={xs[index]}
                y={HEIGHT + 14}
                textAnchor={
                  index === 0 && fractions[index] < 0.02
                    ? "start"
                    : index === dates.length - 1 && fractions[index] > 0.98
                      ? "end"
                      : "middle"
                }
              >
                {formatDate(dates[index])}
              </text>
            ))}

            {/* Hit areas last, so they sit above the painted bands. Each spans
                the midpoints to its neighbours, so pointing anywhere picks the
                nearest snapshot rather than only its exact pixel. */}
            {dates.map((date, index) => {
              const left = index === 0 ? 0 : (xs[index - 1] + xs[index]) / 2;
              const right =
                index === dates.length - 1
                  ? width
                  : (xs[index] + xs[index + 1]) / 2;
              return (
                <rect
                  key={`hit-${date}`}
                  className={styles["hit"]}
                  x={left}
                  y={0}
                  width={Math.max(right - left, 1)}
                  height={HEIGHT + LABEL_BAND}
                  onMouseEnter={() => onHoverIndex(index)}
                />
              );
            })}
          </svg>
        ) : (
          <div style={{ height: HEIGHT + LABEL_BAND }} />
        )}

        <ChartTooltip
          content={
            hoverIndex !== null && xs[hoverIndex] !== undefined
              ? {
                  x: xs[hoverIndex],
                  y: y(totals[hoverIndex]),
                  boxWidth: width,
                  title: formatDate(dates[hoverIndex]),
                  rows: [
                    { value: formatCurrency(totals[hoverIndex]) },
                    hoverIndex > 0
                      ? {
                          label: `fra ${formatDate(dates[hoverIndex - 1])}`,
                          value: formatSignedCurrency(
                            totals[hoverIndex] - totals[hoverIndex - 1]
                          ),
                          tone:
                            totals[hoverIndex] - totals[hoverIndex - 1] >= 0
                              ? "good"
                              : "bad",
                        }
                      : { value: "Første registrering", tone: "muted" },
                  ],
                }
              : null
          }
        />
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
  const slots = useMemo(
    () => categorySlots(chart.bands.map((band) => band.category)),
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
                  background: categoryColor(slots.get(band.category) ?? 0),
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
