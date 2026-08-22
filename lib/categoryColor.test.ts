import { describe, expect, it } from "vitest";
import { categoryHues, getCategoryHue } from "./categoryColor";

describe("getCategoryHue", () => {
  it("is stable for the same name", () => {
    expect(getCategoryHue("Fond")).toBe(getCategoryHue("Fond"));
  });

  it("ignores case and surrounding whitespace", () => {
    expect(getCategoryHue("  fond ")).toBe(getCategoryHue("Fond"));
  });

  it("stays inside the hue wheel", () => {
    for (const name of ["Fond", "BSU", "", "æøå", "a".repeat(200)]) {
      const hue = getCategoryHue(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("gives an empty name a real bucket rather than colliding on 0", () => {
    expect(getCategoryHue("")).toBe(getCategoryHue("ukategorisert"));
  });
});

describe("categoryHues", () => {
  it("spaces hues evenly so adjacent bands stay distinguishable", () => {
    // These three hash to near-identical hues, which is what motivated this.
    const names = ["Fond", "BSU", "Aksjesparekonto", "Sparekonto"];
    const hues = [...categoryHues(names).values()].sort((a, b) => a - b);
    for (let i = 1; i < hues.length; i += 1) {
      expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(360 / names.length - 1);
    }
  });

  it("is deterministic for the same set", () => {
    const names = ["Fond", "BSU", "Aksjesparekonto"];
    expect([...categoryHues(names)]).toEqual([...categoryHues(names)]);
  });

  it("does not depend on input order", () => {
    const a = categoryHues(["Fond", "BSU", "Aksje"]);
    const b = categoryHues(["Aksje", "Fond", "BSU"]);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("de-duplicates repeated names", () => {
    expect(categoryHues(["Fond", "Fond", "BSU"]).size).toBe(2);
  });

  it("handles one category and none at all", () => {
    expect([...categoryHues(["Fond"]).values()]).toEqual([0]);
    expect(categoryHues([]).size).toBe(0);
  });

  it("covers every name given", () => {
    const names = ["Fond", "BSU", "Aksjesparekonto", "Sparekonto", "Buffer"];
    const hues = categoryHues(names);
    names.forEach((name) => expect(hues.has(name)).toBe(true));
  });
});
