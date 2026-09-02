"use client";

/**
 * The monthly column chart, in three shapes: a grouped pair (income vs.
 * expenses, in the period picker), a single series diverging from zero (net per
 * month, on /innsikt), and a single series with a reference marker (spend vs.
 * budget, in the category drill-down).
 *
 * Those were three hand-rolled div-and-percentage charts with three different
 * hover behaviours and no axis between them. They are one component because
 * they are one chart — months across, kroner up, hover for the figures — and
 * the parts that actually differ are the two props below.
 *
 * The bars deliberately do **not** animate. Every month key changes when the
 * window shifts, so React remounts the marks and a grow-from-the-baseline
 * entrance replayed in full on every press of the period picker's arrows —
 * unreadable when stepping through months quickly. The hover band and the
 * tooltip still animate: those are pointer feedback, not data arriving.
 *
 * The hover band is drawn only when `onSelect` is given. It reads as "this
 * column is pickable", so on the read-only charts (/innsikt's net columns, the
 * drill-down) it lit up a target that does nothing; there, a hover produces the
 * tooltip and nothing else. The *selected* band is unconditional — that is
 * state, not an affordance.
 *
 * Interaction sits in an HTML layer of transparent buttons over the SVG rather
 * than on the SVG shapes: a real `<button>` brings keyboard focus, `aria-pressed`
 * and a focus ring with it, and tiling them across the plot means pointing
 * anywhere snaps to the nearest month.
 */

import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import {
  ChartTooltip,
  GridLines,
  bandLayout,
  useMeasure,
  type TooltipRow,
} from "./charts";
import { axisTicks, divergingTicks, shortAmount } from "@/lib/chart";
import styles from "./charts.module.css";

export type MonthPoint = {
  key: string;
  /** Short month name, e.g. "jan". */
  label: string;
  /** Drawn under the label; used for January and the first column. */
  yearLabel?: string;
  /** One value per series. Negative values are only meaningful when diverging. */
  values: number[];
  /** A reference value drawn as a tick across the column (a budget). */
  marker?: number;
  /** No transactions at all — drawn faint, so it reads as "no data" rather
   *  than "nothing spent". */
  empty?: boolean;
  tooltip: { title: string; rows: TooltipRow[] };
};

export type MonthSeries = {
  key: string;
  color: string;
  /** Used for values below zero when `diverging`. */
  negativeColor?: string;
};

const LABEL_BAND = 22;

/** Surface gap between the two bars of a grouped column. */
const GROUP_GAP = 2;

export default function MonthColumns({
  points,
  series,
  height = 150,
  diverging = false,
  selectedKeys,
  onSelect,
  ariaLabel,
  selectHint,
  axisValues = true,
}: {
  points: MonthPoint[];
  series: MonthSeries[];
  /** Height of the plot, excluding the month-label strip below it. */
  height?: number;
  diverging?: boolean;
  selectedKeys?: Set<string>;
  onSelect?: (point: MonthPoint, event: React.MouseEvent) => void;
  ariaLabel: string;
  /** Appended to each column's accessible name when the chart is clickable. */
  selectHint?: (point: MonthPoint) => string;
  /** Set false to keep the gridlines but drop their value labels. */
  axisValues?: boolean;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const scale = useMemo(() => {
    let up = 0;
    let down = 0;
    points.forEach((point) => {
      point.values.forEach((value) => {
        up = Math.max(up, value);
        down = Math.max(down, -value);
      });
      if (point.marker !== undefined) up = Math.max(up, point.marker);
    });

    if (!diverging) {
      const ticks = axisTicks(up);
      const top = ticks[ticks.length - 1] || 1;
      return { ticks, top, bottom: 0 };
    }

    return divergingTicks(up, down);
  }, [points, series.length, diverging]);

  const y = useMemo(
    () => scaleLinear().domain([scale.bottom, scale.top]).range([height, 0]),
    [scale.bottom, scale.top, height]
  );
  const zeroY = y(0);

  const band = bandLayout(points.length, width, points.length > 14 ? 0.28 : 0.34);
  // Capped at 24px rather than filling the slot: a column that takes its whole
  // band reads as a block of colour, and the leftover is what makes the chart
  // legible. Two series split one band with a 2px surface gap between them —
  // white doing the separating, not a stroke round each bar.
  const barWidth = Math.max(
    2,
    Math.min(
      24,
      series.length > 1 ? (band.bar - GROUP_GAP) / series.length : band.bar
    )
  );

  // Thin the month labels rather than letting them overlap: two years of
  // months in a phone-width card has room for about every third one.
  const labelEvery = Math.max(1, Math.ceil(26 / Math.max(band.step, 1)));

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className={styles["columns-wrap"]} ref={ref}>
      {width > 0 && points.length ? (
        <svg
          width={width}
          height={height + LABEL_BAND}
          role="img"
          aria-label={ariaLabel}
        >
          <GridLines
            ticks={scale.ticks}
            y={y}
            width={width}
            format={shortAmount}
            showValues={axisValues}
          />

          {points.map((point, index) => {
            const isSelected = selectedKeys?.has(point.key) ?? false;
            // Only where a column can actually be clicked. The band is a
            // "this one is pickable" affordance, so on a read-only chart
            // (/innsikt's net columns, CategoryDrilldown) it lit up a target
            // that does nothing — the tooltip is the whole payload there.
            const isHovered = Boolean(onSelect) && hoverIndex === index;
            return (
              <rect
                key={`band-${point.key}`}
                className={`${styles["column-band"]} ${
                  isSelected
                    ? styles["column-band-active"]
                    : isHovered
                      ? styles["column-band-hover"]
                      : ""
                }`}
                x={band.left(index) + 1}
                y={0}
                width={Math.max(band.step - 2, 1)}
                height={height + LABEL_BAND - 2}
                rx={8}
              />
            );
          })}

          {diverging ? (
            <line className={styles["zero-line"]} x1={0} x2={width} y1={zeroY} y2={zeroY} />
          ) : null}

          {points.map((point, index) =>
            point.values.map((value, seriesIndex) => {
              const spec = series[seriesIndex];
              const groupWidth =
                barWidth * series.length + (series.length - 1) * GROUP_GAP;
              const x =
                band.center(index) -
                groupWidth / 2 +
                seriesIndex * (barWidth + GROUP_GAP);
              const top = value >= 0 ? y(value) : zeroY;
              const size = Math.abs(y(value) - zeroY);
              const color =
                value < 0 && spec.negativeColor ? spec.negativeColor : spec.color;
              return (
                <rect
                  key={`${point.key}-${spec.key}`}
                  x={x}
                  y={top}
                  width={barWidth}
                  height={Math.max(size, value === 0 ? 0 : 2)}
                  // Bounded by the bar's own height too, or a two-pixel bar
                  // renders as a lozenge floating off the baseline.
                  rx={Math.min(4, barWidth / 2, Math.max(size, 1) / 2)}
                  fill={color}
                  opacity={point.empty ? 0.35 : 1}
                />
              );
            })
          )}

          {points.map((point, index) =>
            point.marker !== undefined ? (
              <line
                key={`marker-${point.key}`}
                className={styles["column-marker"]}
                x1={band.center(index) - band.bar / 2}
                x2={band.center(index) + band.bar / 2}
                y1={y(point.marker)}
                y2={y(point.marker)}
              />
            ) : null
          )}

          {points.map((point, index) => {
            const keep =
              index % labelEvery === 0 || index === points.length - 1 || point.yearLabel;
            if (!keep) return null;
            const isActive =
              hoverIndex === index || (selectedKeys?.has(point.key) ?? false);
            return (
              <g key={`label-${point.key}`}>
                <text
                  className={`${styles["axis-label"]} ${isActive ? styles["axis-label-active"] : ""}`}
                  x={band.center(index)}
                  y={height + (point.yearLabel ? 10 : 14)}
                >
                  {point.label}
                </text>
                {point.yearLabel ? (
                  <text
                    className={styles["axis-text"]}
                    x={band.center(index)}
                    y={height + 19}
                    textAnchor="middle"
                  >
                    {point.yearLabel}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: height + LABEL_BAND }} />
      )}

      <div
        className={styles["hit-layer"]}
        onMouseLeave={() => setHoverIndex(null)}
        role={onSelect ? "group" : undefined}
      >
        {points.map((point, index) => {
          const style = { left: band.left(index), width: band.step };
          const name = `${point.tooltip.title}: ${point.tooltip.rows
            .map((row) => `${row.label ? `${row.label} ` : ""}${row.value}`)
            .join(", ")}`;
          return onSelect ? (
            <button
              key={point.key}
              type="button"
              className={styles["hit"]}
              style={style}
              aria-pressed={selectedKeys?.has(point.key) ?? false}
              aria-label={selectHint ? `${selectHint(point)}. ${name}` : name}
              onMouseEnter={() => setHoverIndex(index)}
              onFocus={() => setHoverIndex(index)}
              onBlur={() => setHoverIndex(null)}
              onClick={(event) => onSelect(point, event)}
            />
          ) : (
            <div
              key={point.key}
              className={styles["hit"]}
              style={style}
              role="img"
              aria-label={name}
              onMouseEnter={() => setHoverIndex(index)}
            />
          );
        })}
      </div>

      <ChartTooltip
        content={
          hovered && width > 0
            ? {
                x: band.center(hoverIndex as number),
                // Pinned to the top of the plot, not to the hovered bar. Riding
                // the bar tops meant the tooltip jumped up and down as the
                // pointer swept across the months — and on the diverging chart
                // it crossed the zero line mid-sweep. One constant height is
                // calmer and never covers the bar being read.
                y: 0,
                flip: "above",
                boxWidth: width,
                title: hovered.tooltip.title,
                rows: hovered.tooltip.rows,
              }
            : null
        }
      />
    </div>
  );
}
