// A category's colour, derived from its name.
//
// Deliberately a pure function of the name rather than a stored column: a
// category gets a stable colour the moment it exists, the same colour in every
// chart on every route, and nothing has to be migrated when one is renamed or
// a new one appears (a savings category, for instance, exists only as a name).
//
// Saturation and lightness come from the `--seg-*` / `--dot-*` / `--bar-*` /
// `--pill-*` custom properties in app/globals.css, so each surface tunes its
// own contrast per theme while the hue stays shared. Callers pass the hue into
// CSS and pick the pair they want.

/**
 * Hue in 0..359 for a category name.
 *
 * Case- and whitespace-insensitive so "Fond" and "fond " land on the same
 * colour. An empty name falls back to a fixed bucket rather than 0, which
 * would collide with every other name that happens to hash there.
 */
export function getCategoryHue(name: string): number {
  const normalized = name.trim().toLowerCase() || "ukategorisert";
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
  }
  return Math.abs(hash);
}

/**
 * Hues for a set of categories that will be shown *adjacent to each other*,
 * spaced evenly around the wheel so neighbouring bands are always tellable
 * apart.
 *
 * `getCategoryHue` alone is not enough for a stacked chart: it is a hash, so
 * nothing stops three of the four names in one chart landing within a few
 * degrees of each other — which is exactly what "Fond", "BSU" and
 * "Aksjesparekonto" do. Spacing is a property of the set, not of one name, so
 * it needs the whole set.
 *
 * The hash still decides the *order* categories are placed around the wheel,
 * which buys two things over sorting by name: a category tends to keep the same
 * colour family, and adding or removing one shifts the others by at most a slot
 * instead of reshuffling everything. Colours do change when the set changes —
 * unavoidable when even spacing is the goal, and worth it, since an unreadable
 * chart costs more than a colour that moves the day you open a new account.
 */
export function categoryHues(names: string[]): Map<string, number> {
  const unique = [...new Set(names)];
  const ranked = unique
    .map((name) => ({ name, seed: getCategoryHue(name) }))
    .sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name, "nb"));

  const step = 360 / Math.max(ranked.length, 1);
  const hues = new Map<string, number>();
  ranked.forEach((entry, index) => {
    hues.set(entry.name, Math.round(index * step) % 360);
  });
  return hues;
}
