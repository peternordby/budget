import { describe, expect, it } from "vitest";
import { displayName, fullName } from "@/lib/profile";

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
