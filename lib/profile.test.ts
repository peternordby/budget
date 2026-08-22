import { describe, expect, it } from "vitest";
import { avatarHue, displayName, fullName, initials } from "@/lib/profile";

describe("fullName", () => {
  it("reads and trims the metadata name", () => {
    expect(fullName({ user_metadata: { full_name: "  Peter Nordby  " } })).toBe(
      "Peter Nordby"
    );
  });

  it("is empty when the name is missing, blank or not a string", () => {
    expect(fullName(null)).toBe("");
    expect(fullName({})).toBe("");
    expect(fullName({ user_metadata: null })).toBe("");
    expect(fullName({ user_metadata: { full_name: "   " } })).toBe("");
    expect(fullName({ user_metadata: { full_name: 42 } })).toBe("");
  });
});

describe("displayName", () => {
  it("prefers the name", () => {
    expect(
      displayName({ email: "peter@eksempel.no", user_metadata: { full_name: "Peter" } })
    ).toBe("Peter");
  });

  it("falls back to the local part of the email, which fits a nav chip", () => {
    expect(displayName({ email: "peter.nordby@eksempel.no" })).toBe("peter.nordby");
  });

  it("always has something to render", () => {
    expect(displayName(null)).toBe("Bruker");
    expect(displayName({ email: "" })).toBe("Bruker");
  });
});

describe("initials", () => {
  it("takes two characters from a single word", () => {
    expect(initials("Peter")).toBe("PE");
  });

  it("takes the first and last word, dropping middle names", () => {
    expect(initials("Peter Skaar Nordby")).toBe("PN");
    expect(initials("  ada   lovelace ")).toBe("AL");
  });

  it("has a placeholder rather than rendering an empty circle", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });

  it("counts characters rather than code units, so it cannot split one", () => {
    // "Ø" is one code point; an emoji name is two. Slicing by code unit would
    // return half a surrogate pair and render as a replacement character.
    expect(initials("Øystein")).toBe("ØY");
    expect(initials("🐢")).toBe("🐢");
  });
});

describe("avatarHue", () => {
  it("is stable for a name and spread across names", () => {
    expect(avatarHue("Peter Nordby")).toBe(avatarHue("Peter Nordby"));
    expect(avatarHue("Peter Nordby")).not.toBe(avatarHue("Ada Lovelace"));
  });
});
