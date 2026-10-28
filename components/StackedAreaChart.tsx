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

import { useId, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Reorder, motion, useDragControls } from "motion/react";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
} from "@/lib/format";
import { categoryColor, categorySlots } from "@/lib/categoryColor";
import { IconGrip } from "@/components/icons";
import { bandShapes, datePositions, type StackedChart } from "@/lib/savings";
import { DATE_LABEL_PX, axisTicks, edgeAnchor, labelledDates, shortAmount } from "@/lib/chart";
import { ChartTooltip, GridLines, useChartCurve, useMeasure } from "@/components/charts";
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
  const curve = useChartCurve();
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
  const labelled = useMemo(
    () =>
      width
        ? labelledDates(fractions, DATE_LABEL_PX / width, DATE_LABEL_PX / 2 / width)
        : [],
    [fractions, width]
  );

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
    .curve(curve);
  const edgeLine = line<{ index: number; upper: number }>()
    .x((point) => xs[point.index])
    .y((point) => y(point.upper))
    .curve(curve);

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
                    .curve(curve)(totals) ?? ""
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
                // As style, not the attribute: `.axis-label` sets text-anchor in CSS,
                // which outranks a presentation attribute — the edge labels
                // stayed centred and hung off the chart.
                style={{ textAnchor: edgeAnchor(xs[index], width) }}
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
 * the hovered date (or its latest value when nothing is hovered), and is where
 * the stack is reordered — by dragging a row's grip (mouse or touch, via
 * motion's Reorder, since HTML5 drag-and-drop does nothing on iOS), or with
 * ↑/↓ on the focused grip.
 */
type LegendProps = {
  chart: StackedChart;
  hoverIndex: number | null;
  /** Mid-drag: the order so far, bottom first, for the chart to follow live. */
  onPreview: (order: string[]) => void;
  /** On release (or a keyboard step): the new stack order, bottom first. */
  onReorder: (order: string[]) => void;
};

export function StackedAreaLegend({ chart, hoverIndex, onPreview, onReorder }: LegendProps) {
  const slots = useMemo(
    () => categorySlots(chart.bands.map((band) => band.category)),
    [chart.bands]
  );

  // Bottom-of-stack first in the data; the legend lists top-of-stack first so
  // its rows run in the same direction as the chart reads from the top down.
  const committed = useMemo(() => [...chart.bands].reverse(), [chart.bands]);
  const reorder = (topFirst: string[]) => onReorder([...topFirst].reverse());

  // While a row is being dragged the legend owns the order, so its rows
  // never wait on the page; the chart follows through onPreview (a low-
  // priority update on the page's side), and the order is stored once, on
  // release. Committing every swap re-rendered and stored synchronously, and
  // made the drag crawl.
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const updateDraft = (next: string[] | null) => {
    draftRef.current = next;
    setDraft(next);
    if (next) onPreview([...next].reverse());
  };
  const commitDraft = () => {
    if (draftRef.current) reorder(draftRef.current);
    updateDraft(null);
  };
  const byName = useMemo(
    () => new Map(committed.map((band) => [band.category, band])),
    [committed]
  );
  const rows = draft
    ? draft.flatMap((name) => byName.get(name) ?? [])
    : committed;
  const names = rows.map((band) => band.category);
  // Rows are held inside the list: dragged out past it, a row was left
  // stranded over the page when the pointer let go somewhere else.
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles["legend"]}>
      <div className={styles["legend-head"]}>
        <span />
        <span />
        <span>Kategori</span>
        <span className="num">
          {hoverIndex !== null ? formatDate(chart.dates[hoverIndex]) : "Nå"}
        </span>
        <span className="num">Endring</span>
      </div>

      <Reorder.Group
        ref={listRef}
        as="div"
        axis="y"
        values={names}
        onReorder={updateDraft}
        className={styles["legend-rows"]}
      >
        {rows.map((band, rowIndex) => {
          const value = hoverIndex !== null ? band.values[hoverIndex] : band.latest;
          // At a hovered date, the change is against the previous timeline
          // date — which is what the guide is sitting between. Null when
          // either side is missing, rather than treating an absent category as 0.
          const change =
            hoverIndex !== null
              ? hoverIndex > 0 &&
                band.values[hoverIndex] !== null &&
                band.values[hoverIndex - 1] !== null
                ? (band.values[hoverIndex] as number) - (band.values[hoverIndex - 1] as number)
                : null
              : band.change;
          return (
            <LegendRow
              key={band.category}
              category={band.category}
              color={categoryColor(slots.get(band.category) ?? 0)}
              stale={band.stale}
              lastObserved={band.lastObserved}
              value={value}
              change={change}
              constraints={listRef}
              onDragEnd={commitDraft}
              onStep={(direction) => {
                const to = rowIndex + direction;
                if (to < 0 || to >= names.length) return;
                const next = [...names];
                next.splice(to, 0, next.splice(rowIndex, 1)[0]);
                reorder(next);
              }}
            />
          );
        })}
      </Reorder.Group>
    </div>
  );
}

function LegendRow({
  category,
  color,
  stale,
  lastObserved,
  value,
  change,
  constraints,
  onDragEnd,
  onStep,
}: {
  category: string;
  color: string;
  stale: boolean;
  lastObserved: string;
  value: number | null;
  change: number | null;
  constraints: RefObject<HTMLDivElement | null>;
  onDragEnd: () => void;
  /** Keyboard reorder: -1 is up the list (towards the top of the stack). */
  onStep: (direction: -1 | 1) => void;
}) {
  // Dragging starts only from the grip, so on a phone the rest of the row
  // still scrolls the page instead of picking the row up.
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={category}
      dragListener={false}
      dragControls={controls}
      dragConstraints={constraints}
      // No overshoot: a row stretched past the list gave its scroll
      // container (see .legend) something to scroll, and a scrollbar flashed.
      dragElastic={0}
      onDragEnd={onDragEnd}
      className={styles["legend-row"]}
      whileDrag={{ zIndex: 2 }}
    >
      <button
        type="button"
        className={styles["grip"]}
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onStep(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
        aria-label={`Flytt ${category}. Dra, eller bruk piltastene.`}
        title="Dra for å endre rekkefølgen i grafen"
      >
        <IconGrip />
      </button>
      <span className={styles["swatch"]} style={{ background: color } as CSSProperties} />
      <span className={styles["legend-name"]}>
        <span className={styles["legend-name-text"]}>{category}</span>
        {stale ? (
          <span
            className={styles["stale"]}
            title={`Sist registrert ${formatDate(lastObserved)}. Verdien videreføres i grafen fram til i dag.`}
          >
            sist {formatDate(lastObserved)}
          </span>
        ) : null}
      </span>
      <strong className="num">{value === null ? "—" : formatCurrency(value)}</strong>
      <span
        className={`num ${
          change === null ? "helper" : change >= 0 ? "text-income" : "text-expense"
        }`}
      >
        {change === null
          ? "—"
          : `${change >= 0 ? "+" : "-"}${formatCurrency(Math.abs(change))}`}
      </span>
    </Reorder.Item>
  );
}
