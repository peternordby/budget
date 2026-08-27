import { describe, expect, it } from "vitest";
import {
  CATEGORY_SLOT_COUNT,
  categoryColor,
  categoryInk,
  categorySlots,
  categoryTint,
  getCategorySlot,
} from "./categoryColor";

describe("getCategorySlot", () => {
  it("is stable for the same name", () => {
    expect(getCategorySlot("Fond")).toBe(getCategorySlot("Fond"));
  });

  it("ignores case and surrounding whitespace", () => {
    expect(getCategorySlot("  fond ")).toBe(getCategorySlot("Fond"));
  });

  it("stays inside the palette", () => {
    for (const name of ["Fond", "BSU", "", "æøå", "a".repeat(200)]) {
      const slot = getCategorySlot(name);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(CATEGORY_SLOT_COUNT);
      expect(Number.isInteger(slot)).toBe(true);
    }
  });

  it("gives an empty name a real bucket rather than colliding on 0", () => {
    expect(getCategorySlot("")).toBe(getCategorySlot("ukategorisert"));
  });

  it("does not put every name in one slot", () => {
    const names = [
      "Mat",
      "Bolig",
      "Transport",
      "Fond",
      "BSU",
      "Aksjesparekonto",
      "Lønn",
      "Strøm",
      "Klær",
      "Ferie",
    ];
    const used = new Set(names.map(getCategorySlot));
    expect(used.size).toBeGreaterThan(2);
  });
});

describe("categorySlots", () => {
  it("gives every category in a chart its own slot while slots last", () => {
    // These three hash to near-identical hues under the old scheme, which is
    // what motivated a set-aware assignment in the first place.
    const names = ["Fond", "BSU", "Aksjesparekonto", "Sparekonto"];
    const slots = categorySlots(names);
    expect(new Set(slots.values()).size).toBe(names.length);
  });

  it("fills the palette exactly at eight categories", () => {
    const names = Array.from({ length: CATEGORY_SLOT_COUNT }, (_, i) => `Konto ${i}`);
    const slots = categorySlots(names);
    expect(new Set(slots.values()).size).toBe(CATEGORY_SLOT_COUNT);
  });

  it("still colours a ninth category rather than dropping it", () => {
    const names = Array.from({ length: CATEGORY_SLOT_COUNT + 3 }, (_, i) => `Konto ${i}`);
    const slots = categorySlots(names);
    expect(slots.size).toBe(names.length);
    [...slots.values()].forEach((slot) => {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(CATEGORY_SLOT_COUNT);
    });
  });

  it("keeps a category's preferred slot when nothing collides with it", () => {
    // The whole point of slots over evenly-spaced hues: adding a category must
    // not repaint the others.
    const before = categorySlots(["Fond", "BSU"]);
    const after = categorySlots(["Fond", "BSU", "Zebra-konto"]);
    ["Fond", "BSU"].forEach((name) => {
      if (getCategorySlot(name) === before.get(name)) {
        expect(after.get(name)).toBe(before.get(name));
      }
    });
  });

  it("is deterministic for the same set", () => {
    const names = ["Fond", "BSU", "Aksjesparekonto"];
    expect([...categorySlots(names)]).toEqual([...categorySlots(names)]);
  });

  it("does not depend on input order", () => {
    const a = categorySlots(["Fond", "BSU", "Aksje"]);
    const b = categorySlots(["Aksje", "Fond", "BSU"]);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("de-duplicates repeated names", () => {
    expect(categorySlots(["Fond", "Fond", "BSU"]).size).toBe(2);
  });

  it("handles one category and none at all", () => {
    expect(categorySlots(["Fond"]).size).toBe(1);
    expect(categorySlots([]).size).toBe(0);
  });

  it("covers every name given", () => {
    const names = ["Fond", "BSU", "Aksjesparekonto", "Sparekonto", "Buffer"];
    const slots = categorySlots(names);
    names.forEach((name) => expect(slots.has(name)).toBe(true));
  });
});

describe("colour expressions", () => {
  it("maps slot 0 to the first token, not the zeroth", () => {
    expect(categoryColor(0)).toBe("var(--cat-1)");
    expect(categoryColor(CATEGORY_SLOT_COUNT - 1)).toBe("var(--cat-8)");
  });

  it("wraps rather than emitting a token that does not exist", () => {
    expect(categoryColor(CATEGORY_SLOT_COUNT)).toBe("var(--cat-1)");
  });

  it("builds tint and ink off the same slot token", () => {
    expect(categoryTint(2)).toContain("var(--cat-3)");
    expect(categoryInk(2)).toContain("var(--cat-3)");
    expect(categoryTint(2)).not.toBe(categoryInk(2));
  });
});
