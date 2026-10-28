import { describe, expect, it } from "vitest";
import { ACCENTS, contrastInk, parseAppearance, toAppearance } from "@/lib/appearance";

describe("contrastInk", () => {
  it("puts white on a dark accent and dark text on a light one", () => {
    expect(contrastInk("#3a73c4")).toBe("#ffffff");
    expect(contrastInk("#f5c400")).toBe("#111111");
    expect(contrastInk("#ffffff")).toBe("#111111");
    expect(contrastInk("#000000")).toBe("#ffffff");
  });

  it("covers every preset", () => {
    ACCENTS.forEach((accent) => expect(contrastInk(accent.value)).toMatch(/^#(ffffff|111111)$/));
  });
});

describe("parseAppearance", () => {
  it("reads a stored choice", () => {
    expect(parseAppearance('{"style":"glass","accent":"#e0245e"}')).toEqual({
      style: "glass",
      accent: "#e0245e",
    });
  });

  it("falls back on anything it does not recognise", () => {
    const fallback = { style: "standard", accent: null };
    expect(parseAppearance(null)).toEqual(fallback);
    expect(parseAppearance("not json")).toEqual(fallback);
    expect(parseAppearance('{"style":"comic","accent":"red","glass":7}')).toEqual(fallback);
  });
});

describe("toAppearance", () => {
  it("reads user_metadata.appearance, which may be missing", () => {
    expect(toAppearance({ style: "neu", accent: "#1f9d48" })).toEqual({ style: "neu", accent: "#1f9d48" });
    expect(toAppearance(undefined)).toEqual({ style: "standard", accent: null });
  });
});
