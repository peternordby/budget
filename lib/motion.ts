/**
 * Motion tokens. One easing curve and three durations for the whole app, so a
 * bar growing, a tooltip appearing and a panel sliding in are recognisably the
 * same system rather than three people's guesses.
 *
 * The curve is the one `card-rise` in `app/globals.css` already used, so CSS
 * transitions and `motion` animations land on the same feel. Reduced motion is
 * handled once, by `<MotionConfig reducedMotion="user">` in the (app) layout —
 * individual components never check the media query.
 */
export const EASE = [0.22, 0.61, 0.36, 1] as const;

/** Pointer feedback: hover, press, tooltip. Must feel instant. */
export const T_FAST = { duration: 0.14, ease: EASE };

/** State changes the user asked for: a panel opening, a section expanding. */
export const T_BASE = { duration: 0.22, ease: EASE };

/** Data arriving: bars growing from the baseline, a line drawing itself. */
export const T_DRAW = { duration: 0.45, ease: EASE };

/** Per-mark delay for a staggered chart entrance, capped so a 24-month
 *  window does not take a second and a half to finish drawing. */
export function stagger(index: number, step = 0.018, max = 0.28) {
  return Math.min(index * step, max);
}
