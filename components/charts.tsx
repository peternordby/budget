"use client";

/**
 * The chart kit: the parts every chart in the app shares.
 *
 * Charts here measure their own pixel width (`useMeasure`) and draw in real
 * pixels, rather than stretching a fixed viewBox with
 * `preserveAspectRatio="none"`. That was the source of most of the awkwardness
 * in the old charts — text inside a non-uniformly scaled viewBox is squashed,
 * so every label had to be HTML positioned in percentages over the SVG, and
 * every stroke needed `vector-effect`. Measuring costs one ResizeObserver and
 * buys back plain `<text>`, honest stroke widths and one shared tooltip.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { T_BASE, T_DRAW, T_FAST, stagger } from "@/lib/motion";
import { shareWidths } from "@/lib/chart";
import styles from "./charts.module.css";

/* ------------------------------------------------------------------ measure */

/**
 * The element's content-box width, and a ref to put on it. 0 until measured —
 * callers render nothing (or a fixed-height placeholder) at 0, which is also
 * what happens for one frame on mount.
 */
export function useMeasure<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const node = useRef<T | null>(null);

  const ref = useCallback((element: T | null) => {
    node.current = element;
    if (element) setWidth(element.clientWidth);
  }, []);

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Sub-pixel jitter from a flexbox reflow would otherwise re-render the
      // whole chart on every scroll-driven layout pass.
      setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return [ref, width] as const;
}

/* ------------------------------------------------------------------ tooltip */

export type TooltipRow = {
  label?: string;
  value: string;
  tone?: "good" | "bad" | "muted";
  swatch?: string;
};

export type TooltipContent = {
  /** Anchor point, in pixels inside the measured chart box. */
  x: number;
  y: number;
  /** The box's width, so the tooltip can flip away from an edge. */
  boxWidth: number;
  title: string;
  rows: TooltipRow[];
  /**
   * Force which side of the anchor the tooltip hangs off, instead of deriving
   * it from `y`.
   *
   * Needed because a chart's tooltip cannot escape its own card. Two rules in
   * globals.css put it in a box: `.card > *` sets `position: relative; z-index:
   * 1` on every direct child, so a later sibling inside the same card (a legend,
   * a stat row) paints over anything overflowing an earlier one — equal z-index,
   * DOM order wins. And `.card` itself carries `backdrop-filter`, which always
   * makes an element a stacking context, so overflowing the card entirely is no
   * better: the next section covers it. Either way, a tooltip that would hang
   * past the chart has to point inward instead.
   */
  flip?: "above" | "below";
};

/**
 * The one tooltip. Every chart renders exactly this, so a hover readout looks
 * and behaves the same on /oversikt, /innsikt, /sparing and the period picker.
 *
 * Must be rendered inside a `position: relative` box that the coordinates in
 * `content` are measured against — normally the same element `useMeasure`
 * observes. `pointer-events: none`, or it steals the pointer from the hit
 * areas underneath and flickers.
 *
 * Positioning is split in two on purpose: the outer element owns the placement
 * transform (which corner it hangs off), the inner one owns the animation, so
 * motion's inline `transform` never fights the placement.
 */
export function ChartTooltip({ content }: { content: TooltipContent | null }) {
  // Frozen while fading out, so the text does not blank mid-exit.
  const last = useRef<TooltipContent | null>(null);
  if (content) last.current = content;
  const shown = content ?? last.current;
  if (!shown) return null;

  const side =
    shown.x < 90 ? "left" : shown.x > shown.boxWidth - 90 ? "right" : "center";
  const flip = shown.flip ?? (shown.y < 78 ? "below" : "above");

  // A `span` rather than a `div` throughout: /innsikt renders a sparkline (and
  // so this tooltip) inside a category tile that is a real `<button>`, which
  // may only contain phrasing content.
  //
  // `aria-hidden`, because it is purely visual: every chart gives its hit areas
  // an aria-label carrying the same figures, so announcing the tooltip as well
  // would read every hovered month twice.
  return (
    <span
      className={styles["tooltip-anchor"]}
      data-side={side}
      data-flip={flip}
      style={{ left: shown.x, top: shown.y }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {content ? (
          <motion.span
            className={styles["tooltip"]}
            initial={{ opacity: 0, y: flip === "above" ? 3 : -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={T_FAST}
          >
            <span className={styles["tooltip-title"]}>{shown.title}</span>
            {shown.rows.map((row, index) => (
              <span key={index} className={styles["tooltip-row"]}>
                {row.swatch ? (
                  <span
                    className={styles["tooltip-swatch"]}
                    style={{ background: row.swatch }}
                  />
                ) : null}
                {row.label ? (
                  <span className={styles["tooltip-label"]}>{row.label}</span>
                ) : null}
                <strong
                  className={`num ${
                    row.tone === "good"
                      ? "text-income"
                      : row.tone === "bad"
                        ? "text-expense"
                        : row.tone === "muted"
                          ? "helper"
                          : ""
                  }`}
                >
                  {row.value}
                </strong>
              </span>
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* -------------------------------------------------------------------- axes */

/**
 * Horizontal gridlines with their value labels sitting just above each line at
 * the left edge of the plot — no axis gutter to reserve, and the labels cannot
 * drift out of alignment with the lines they belong to.
 */
export function GridLines({
  ticks,
  y,
  width,
  format,
  showValues = true,
}: {
  ticks: number[];
  y: (value: number) => number;
  width: number;
  format: (value: number) => string;
  /**
   * Set false to draw the lines without their values. For a chart whose job is
   * comparison rather than reading a figure off the axis — the period picker,
   * where the numbers are in the tooltip and the point of the chart is which
   * month is bigger — the labels are ink that says nothing the tooltip doesn't.
   * The lines stay: they are what makes two months comparable by eye.
   */
  showValues?: boolean;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick, index) => (
        <g key={index}>
          <line
            className={styles["grid"]}
            x1={0}
            x2={width}
            y1={y(tick)}
            y2={y(tick)}
          />
          {showValues ? (
            <text className={styles["axis-text"]} x={0} y={y(tick) - 4}>
              {format(tick)}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}

/* --------------------------------------------------------------- bullet bar */

/**
 * One horizontal bar in a track, optionally with a marker for a reference
 * value (a budget). Used for a category row on /oversikt and /budsjett — the
 * rows either side of it are HTML, so this is only ever the 6px chart strip.
 *
 * The value width is animated by motion rather than a CSS `transition` on
 * `width`, so it tweens the same way when the number changes as when the row
 * first mounts, and reduced motion is handled by the one MotionConfig.
 */
export function BulletBar({
  fraction,
  color,
  markerFraction,
  height = 6,
  ariaLabel,
}: {
  /** 0..1, clamped. Values above 1 fill the track. */
  fraction: number;
  color: string;
  /** 0..1, drawn as a tick across the track. Omit for "no budget set". */
  markerFraction?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const filled = Math.max(0, Math.min(fraction, 1));
  // Measured rather than drawn into a stretched viewBox: with
  // preserveAspectRatio="none", a 3px corner radius on a bar stretched from 100
  // to 600 units comes out as an 18px-wide skewed cap.
  return (
    <div className={styles["bullet"]} style={{ height }} ref={ref}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role={ariaLabel ? "img" : "presentation"}
          aria-label={ariaLabel}
          aria-hidden={ariaLabel ? undefined : true}
        >
          <rect
            className={styles["bullet-track"]}
            x={0}
            y={0}
            width={width}
            height={height}
            rx={height / 2}
          />
          <motion.rect
            y={0}
            height={height}
            rx={height / 2}
            fill={color}
            initial={{ width: 0 }}
            animate={{ width: filled * width }}
            transition={T_DRAW}
          />
          {markerFraction !== undefined &&
          markerFraction > 0 &&
          markerFraction < 1 ? (
            <rect
              className={styles["bullet-marker"]}
              x={markerFraction * width - 1}
              y={-1}
              width={2}
              height={height + 2}
              rx={1}
            />
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- gauge */

/**
 * The budget ring. A stroked circle with an animated dash offset rather than a
 * `d3-shape` arc: an arc means animating a path string, which motion cannot
 * interpolate, where a dash offset is one number it tweens natively.
 *
 * The unfilled track is the fill's own colour at low opacity rather than a
 * neutral grey, so the state reads across the whole ring instead of only the
 * filled arc.
 */
export function GaugeArc({
  fraction,
  color,
  size = 140,
  thickness = 14,
  children,
}: {
  fraction: number;
  color: string;
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(fraction, 1));
  const overflow = Math.max(0, Math.min(fraction - 1, 1));
  const center = size / 2;

  return (
    <div className={styles["gauge"]} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        {/* Straight up is -90° in SVG's coordinates; the ring is rotated so the
            stroke starts there instead of at 3 o'clock. */}
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeOpacity={0.16}
            strokeWidth={thickness}
          />
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - filled) }}
            transition={T_DRAW}
          />
          {/* A second, thinner lap inside the ring. Overlaying the same colour
              at reduced opacity would have been invisible: past 100 % the ring
              underneath is already full and the same red. */}
          {overflow > 0 ? (
            <motion.circle
              cx={center}
              cy={center}
              r={radius - thickness * 0.75}
              fill="none"
              stroke={color}
              strokeWidth={thickness * 0.4}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * (radius - thickness * 0.75)}
              initial={{
                strokeDashoffset: 2 * Math.PI * (radius - thickness * 0.75),
              }}
              animate={{
                strokeDashoffset:
                  2 * Math.PI * (radius - thickness * 0.75) * (1 - overflow),
              }}
              transition={{ ...T_DRAW, delay: 0.2 }}
            />
          ) : null}
        </g>
      </svg>
      <div className={styles["gauge-center"]}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- share bar */

export type ShareSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/**
 * A single bar split into shares of a whole: spending per category on
 * /oversikt, and where an average month's income goes on /innsikt. Hovering a
 * segment dims the rest and reports its amount and share.
 *
 * /oversikt and /innsikt used to keep two near-identical CSS copies of this,
 * on the reasoning that they would drift apart once either grew a state. They
 * then both grew the same state — a hover readout — which is what made one
 * component the smaller answer.
 */
export function ShareBar({
  segments,
  height = 24,
  formatValue,
  ariaLabel,
  activeKey,
  onActiveKey,
}: {
  segments: ShareSegment[];
  height?: number;
  formatValue: (value: number) => string;
  ariaLabel: string;
  /** Lifted so a legend row and its segment highlight each other. */
  activeKey?: string | null;
  onActiveKey?: (key: string | null) => void;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const clipId = useId().replace(/[^\w-]/g, "");
  const [localKey, setLocalKey] = useState<string | null>(null);
  const active = activeKey !== undefined ? activeKey : localKey;
  const setActive = onActiveKey ?? setLocalKey;

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  // shareWidths gives every segment a hoverable minimum without the bar
  // overflowing — see lib/chart.ts.
  const laid = useMemo(() => {
    if (!width || total <= 0) return [];
    const widths = shareWidths(
      segments.map((segment) => segment.value),
      width
    );
    let x = 0;
    return segments.map((segment, index) => {
      const at = x;
      x += widths[index];
      return {
        ...segment,
        x: at,
        width: widths[index],
        share: segment.value / total,
      };
    });
  }, [segments, total, width]);

  const hovered = laid.find((segment) => segment.key === active) ?? null;

  return (
    <div className={styles["share-wrap"]} ref={ref}>
      {width > 0 && laid.length ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setActive(null)}
        >
          <clipPath id={`share-clip-${clipId}`}>
            <rect x={0} y={0} width={width} height={height} rx={height / 2} />
          </clipPath>
          <g clipPath={`url(#share-clip-${clipId})`}>
            {laid.map((segment, index) => (
              <motion.rect
                key={segment.key}
                y={0}
                height={height}
                fill={segment.color}
                initial={{ x: segment.x, width: 0 }}
                animate={{
                  x: segment.x,
                  width: Math.max(segment.width - 2, 1),
                  opacity: active && active !== segment.key ? 0.32 : 1,
                }}
                transition={{
                  ...T_DRAW,
                  delay: stagger(index),
                  opacity: T_FAST,
                }}
                onMouseEnter={() => setActive(segment.key)}
              />
            ))}
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <ChartTooltip
        content={
          hovered
            ? {
                x: hovered.x + hovered.width / 2,
                // Upward. A share bar sits 24px from the top of its card, so the
                // derived side was "below" — straight into the legend under it,
                // which is a later `.card > *` at the same z-index and therefore
                // paints over it (see `flip`). Above, the only thing in the way
                // is the card heading, an *earlier* sibling, so the tooltip wins.
                y: 0,
                flip: "above",
                boxWidth: width,
                title: hovered.label,
                rows: [
                  { value: formatValue(hovered.value) },
                  {
                    label: "andel",
                    value: `${Math.round(hovered.share * 100)} %`,
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

/* -------------------------------------------------------------- collapsible */

/**
 * Height animation for the two collapsible cards (`/oversikt`'s category list,
 * `RecurringPanel`). Both used to swap the content in and out with no
 * transition, so the page below jumped by several hundred pixels.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={T_BASE}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* --------------------------------------------------------------- band scale */

/**
 * Evenly spaced column centres and a column width, for the month charts.
 * `d3-scale`'s `scaleBand` with an inner padding, spelled out here because
 * every caller wants the centre rather than the left edge.
 */
export function bandLayout(count: number, width: number, padding = 0.3) {
  const step = count > 0 ? width / count : width;
  const bar = step * (1 - padding);
  return {
    step,
    bar,
    center: (index: number) => step * index + step / 2,
    /** The half-open hit area around a column, for pointer tracking. */
    left: (index: number) => step * index,
  };
}

export { scaleLinear };
