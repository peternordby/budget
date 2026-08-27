/**
 * Chart scale and label maths, shared by every chart in the app.
 *
 * These three lived in `components/StackedAreaChart.tsx` when /sparing was the
 * only chart with a real axis. Every chart has one now, so they moved here —
 * `lib/savings.test.ts` covers them.
 */

// Round gridline values covering 0..max in at most this many bands.
const MAX_INTERVALS = 5;

/**
 * Round gridline values covering 0..max.
 *
 * Picks the smallest "nice" step (1, 2, 2.5 or 5 times a power of ten) that
 * covers the data in at most MAX_INTERVALS bands. Choosing the step from
 * `max / 3` instead used to jump a whole magnitude — a 205 600 max landed on a
 * 100 000 step and a 300 000 top gridline, leaving a third of the plot empty.
 *
 * Deliberately not `d3-array`'s `ticks()`: that returns ticks *inside* the
 * domain, so the top one can sit below `max` and the tallest bar would run off
 * the top of the plot. Every caller here scales to `ticks[ticks.length - 1]`.
 */
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
  for (let i = 0; i <= intervals; i += 1) {
    const tick = Math.round(i * step);
    // Sub-krone steps (a chart whose largest value is a few kroner) round
    // several intervals onto the same integer. Emitting them would draw four
    // gridlines labelled "1" on top of each other.
    if (ticks[ticks.length - 1] !== tick) ticks.push(tick);
  }
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

// Smallest horizontal gap between two labels, as a fraction of the plot.
// Snapshot dates cluster (four in one month, then a year's silence), so
// thinning has to go by position rather than by every nth date.
const MIN_LABEL_GAP = 0.085;

/**
 * Which positions to label: the first, the last, and as many in between as fit
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

/**
 * Gridlines for a chart that spans zero in both directions (net per month).
 *
 * One shared step, taken from the larger side, with both ends rounded out to a
 * multiple of it. That does two things at once: the top and bottom of the plot
 * land on gridlines, and zero is exactly on one. Scaling each half by its own
 * extreme instead — which is what the old /innsikt chart looked like it did —
 * would make a 1 000 kr deficit bar as tall as a 10 000 kr surplus bar.
 */
export function divergingTicks(up: number, down: number) {
  const step = axisTicks(Math.max(up, down, 1))[1] || 1;
  const top = Math.ceil(Math.max(up, 0) / step) * step || step;
  // `|| 0` normalises -0, which an all-surplus window would otherwise produce
  // and which reads as "-0" in a tick label.
  const bottom = -(Math.ceil(Math.max(down, 0) / step) * step) || 0;
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value));
  }
  return { ticks, top, bottom };
}

/**
 * Pixel widths for the segments of a 100 %-stacked bar.
 *
 * A segment worth 0.2 % of the total is a sub-pixel sliver: invisible, and
 * impossible to hover for its tooltip. Each segment gets at least `min`, and
 * the pixels that buys are taken back from the segments that have room to give,
 * in proportion to how much room that is — so the bar still ends flush at
 * `width` instead of overflowing by the number of tiny categories.
 */
export function shareWidths(values: number[], width: number, min = 3): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || width <= 0) return values.map(() => 0);
  // Not enough room to give everyone the minimum: fall back to equal shares,
  // which is at least honest about being unreadable.
  if (min * values.length > width) return values.map(() => width / values.length);

  const raw = values.map((value) => (value / total) * width);
  const deficit = raw.reduce((sum, w) => sum + Math.max(0, min - w), 0);
  const surplus = raw.reduce((sum, w) => sum + Math.max(0, w - min), 0);
  return raw.map((w) =>
    w < min ? min : w - (surplus > 0 ? (deficit * (w - min)) / surplus : 0)
  );
}
