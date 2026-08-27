// A category's colour.
//
// Deliberately a pure function of the name rather than a stored column: a
// category gets a stable colour the moment it exists, the same colour in every
// chart on every route, and nothing has to be migrated when one is renamed or a
// new one appears (a savings category, for instance, exists only as a name).
//
// What changed: this used to hash the name to a **hue** and paint it as
// `hsl(hue, --seg-s, --seg-l)` — one saturation and lightness for every hue.
// HSL lightness is not perceptual, so at a fixed 56 % the yellows and cyans
// came out at OKLCH L 0.77 and measured **1.9:1 against the card**, effectively
// invisible, while the blues and violets sat at 3.5:1. Evenly spaced hues also
// collapse under colour-vision deficiency: 45° apart, blue and violet came out
// ΔE 0.2 under deuteranopia — the same colour.
//
// So the hue wheel is gone and there are eight fixed slots instead, validated
// as a set in both themes: every pair of adjacent slots clears CVD ΔE 8 and the
// normal-vision floor of 15, every slot sits inside the lightness band, and all
// eight clear 3:1 on the dark surface (three sit at 2.1–2.8:1 on the light one,
// which is allowed because every chart here ships the figure as text beside the
// mark). A name maps to a slot; the slot's hex lives in `app/globals.css` as
// `--cat-1`..`--cat-8`, so the light and dark steps swap where every other
// theme token does.

/** Slots in the categorical palette. Eight is the palette, not a limit we chose. */
export const CATEGORY_SLOT_COUNT = 8;

/**
 * Slot 0..7 for a category name.
 *
 * Case- and whitespace-insensitive so "Fond" and "fond " land on the same
 * colour. An empty name falls back to a fixed bucket rather than 0, which would
 * collide with every other name that happens to hash there.
 */
export function getCategorySlot(name: string): number {
  const normalized = name.trim().toLowerCase() || "ukategorisert";
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 100_003;
  }
  return Math.abs(hash) % CATEGORY_SLOT_COUNT;
}

/**
 * Slots for a set of categories shown *adjacent to each other*, guaranteed
 * distinct while there are slots left.
 *
 * `getCategorySlot` alone is a hash over eight buckets, so six savings
 * categories collide on a slot more often than not — and two bands painted the
 * same colour in one stacked chart is worse than two bands a shade apart. Each
 * name keeps its preferred slot where it can and walks to the next free one
 * where it cannot.
 *
 * This is where the old `categoryHues` was weakest: it spaced the whole set
 * evenly round the wheel, so **adding one category repainted every other one**.
 * Here a set with no collisions is exactly `getCategorySlot`, and adding a
 * category changes another's colour only when it actually lands on top of it.
 *
 * Pass order is alphabetical rather than the caller's: /sparing lets you drag
 * the stack into any order, and the colours must not follow it.
 */
export function categorySlots(names: string[]): Map<string, number> {
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b, "nb"));
  const taken = new Set<number>();
  const slots = new Map<string, number>();

  unique.forEach((name) => {
    const preferred = getCategorySlot(name);
    let slot = preferred;
    // Past eight categories every slot is taken and the walk gives up, which is
    // the honest outcome: a ninth colour would have to be generated, and a
    // generated hue is what this file exists to stop.
    for (let step = 1; step <= CATEGORY_SLOT_COUNT && taken.has(slot); step += 1) {
      slot = (preferred + step) % CATEGORY_SLOT_COUNT;
    }
    taken.add(slot);
    slots.set(name, slot);
  });

  return slots;
}

/** The slot's colour, for a mark: a bar, a dot, a band, a segment. */
export function categoryColor(slot: number): string {
  return `var(--cat-${(slot % CATEGORY_SLOT_COUNT) + 1})`;
}

/**
 * A wash of the slot's colour, for a surface that sits *behind* text — the
 * category pill in the activity table. Mixed towards the card rather than being
 * its own token, so one hex per slot stays the only thing a theme declares.
 */
export function categoryTint(slot: number): string {
  return `color-mix(in oklab, ${categoryColor(slot)} 15%, var(--surface-solid))`;
}

/**
 * Text on that wash. Mixed towards `--ink`, which is dark in the light theme and
 * light in the dark one, so the same expression reads in both.
 *
 * 34 % is not a round number by accident: at 45 % the yellow slot's pill text
 * measured 3.85:1 on its own tint, under the 4.5:1 WCAG floor for 12px text.
 * 34 % clears every slot in both themes, worst case 4.72:1.
 */
export function categoryInk(slot: number): string {
  return `color-mix(in oklab, ${categoryColor(slot)} 34%, var(--ink))`;
}
