"use client";

/**
 * A small line chart: the fixed-cost trend and one per category tile on
 * /innsikt.
 *
 * It measures itself and draws in real pixels rather than stretching a fixed
 * viewBox, which is what lets it carry a gradient fill, an end dot and a hover
 * readout without any of them being squashed by the horizontal scale. `hover`
 * is what replaced /innsikt's separate overlay of hit areas and its own
 * tooltip: the chart owns its own hover, so every tile behaves the same.
 */

import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { ChartTooltip, useMeasure } from "./charts";
import { T_DRAW, T_FAST } from "@/lib/motion";
import styles from "./charts.module.css";

type SparklineProps = {
  points: number[];
  ariaLabel: string;
  height?: number;
  /**
   * The line's colour. Defaults to the accent, which is right for a chart that
   * is not about a named entity (the fixed-cost trend). A per-category chart
   * passes its category's colour, so the same category is the same colour in
   * its tile here, its bar on /oversikt and its band on /sparing.
   */
  color?: string;
  /** Supply to enable the hover readout. Called with the point's index. */
  hover?: { title: (index: number) => string; value: (index: number) => string };
};

// Half the stroke would clip against the viewBox edge otherwise — visible as a
// flat-topped peak on every tile whose series had a clear maximum.
const INSET = 3;

export default function Sparkline({
  points,
  ariaLabel,
  height = 32,
  color = "var(--accent)",
  hover,
}: SparklineProps) {
  const [ref, width] = useMeasure<HTMLSpanElement>();
  const gradientId = useId().replace(/[^\w-]/g, "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (!width || points.length === 0) return null;

    const min = Math.min(...points);
    const max = Math.max(...points);
    const x = scaleLinear()
      .domain([0, Math.max(points.length - 1, 1)])
      .range([INSET, width - INSET]);
    // A flat series sits on the midline rather than on the floor, where it
    // would read as zero.
    const yScale =
      max === min
        ? () => height / 2
        : scaleLinear().domain([min, max]).range([height - INSET, INSET]);

    const coords: [number, number][] = points.map((value, index) => [
      points.length === 1 ? width / 2 : x(index),
      yScale(value),
    ]);

    return {
      coords,
      linePath: line<[number, number]>().curve(curveMonotoneX)(coords) ?? "",
      areaPath:
        area<[number, number]>()
          .y0(height)
          .y1((point) => point[1])
          .curve(curveMonotoneX)(coords) ?? "",
    };
  }, [points, width, height]);

  const hoveredCoord =
    hoverIndex !== null && geometry ? geometry.coords[hoverIndex] : null;

  return (
    <span className={styles["sparkline-wrap"]} ref={ref} style={{ height }}>
      {geometry && width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={
            hover
              ? (event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const fraction =
                    (event.clientX - box.left - INSET) / Math.max(box.width - INSET * 2, 1);
                  const index = Math.round(fraction * (points.length - 1));
                  setHoverIndex(Math.max(0, Math.min(index, points.length - 1)));
                }
              : undefined
          }
        >
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              {/* A wash at ~14 %, not a fill: the line is the mark, the area
                  only gives it a floor to sit on. */}
              <stop offset="0%" stopColor={color} stopOpacity="0.14" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {points.length > 1 ? (
            <>
              <motion.path
                className={styles["sparkline-area"]}
                d={geometry.areaPath}
                fill={`url(#spark-${gradientId})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={T_DRAW}
              />
              <motion.path
                className={styles["sparkline-line"]}
                stroke={color}
                d={geometry.linePath}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={T_DRAW}
              />
            </>
          ) : null}

          <circle
            className={styles["sparkline-dot"]}
            fill={color}
            cx={geometry.coords[geometry.coords.length - 1][0]}
            cy={geometry.coords[geometry.coords.length - 1][1]}
            r={points.length === 1 ? 2.5 : 2}
          />

          {hoveredCoord ? (
            <>
              <line
                className={styles["sparkline-guide"]}
                stroke={color}
                x1={hoveredCoord[0]}
                x2={hoveredCoord[0]}
                y1={0}
                y2={height}
              />
              <motion.circle
                className={styles["sparkline-dot"]}
                fill={color}
                cx={hoveredCoord[0]}
                cy={hoveredCoord[1]}
                initial={{ r: 0 }}
                animate={{ r: 3.5 }}
                transition={T_FAST}
              />
            </>
          ) : null}
        </svg>
      ) : null}

      {hover ? (
        <ChartTooltip
          content={
            hoveredCoord && hoverIndex !== null
              ? {
                  x: hoveredCoord[0],
                  y: hoveredCoord[1],
                  boxWidth: width,
                  // Always upward, never derived: a sparkline is 32px tall, so
                  // ChartTooltip's y < 78 rule put every readout *below* the
                  // line — under the chart, on top of whatever follows it (the
                  // next tile in /innsikt's grid). Above the hovered point it
                  // sits over the chart it belongs to.
                  flip: "above",
                  title: hover.title(hoverIndex),
                  rows: [{ value: hover.value(hoverIndex) }],
                }
              : null
          }
        />
      ) : null}
    </span>
  );
}
