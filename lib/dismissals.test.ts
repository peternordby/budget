import { describe, expect, it } from "vitest";
import { missingFixedRef, parseDismissals } from "./dismissals";

describe("parseDismissals", () => {
  it("reads a stored map", () => {
    const raw = JSON.stringify({ subscription: ["netflix"], "missing-fixed": ["7:2026-03"] });
    expect(parseDismissals(raw)).toEqual({
      subscription: ["netflix"],
      "missing-fixed": ["7:2026-03"],
    });
  });

  it("treats missing, malformed and non-object values as nothing dismissed", () => {
    const empty = { subscription: [], "missing-fixed": [] };
    expect(parseDismissals(null)).toEqual(empty);
    expect(parseDismissals("{not json")).toEqual(empty);
    expect(parseDismissals("42")).toEqual(empty);
    expect(parseDismissals("null")).toEqual(empty);
  });

  it("drops non-string entries rather than the whole list", () => {
    const raw = JSON.stringify({ subscription: ["spotify", 3, null, "vipps"] });
    expect(parseDismissals(raw)).toEqual({
      subscription: ["spotify", "vipps"],
      "missing-fixed": [],
    });
  });
});

describe("missingFixedRef", () => {
  it("keys a template to one month, so other months stay expected", () => {
    expect(missingFixedRef(7, "2026-03")).toBe("7:2026-03");
    expect(missingFixedRef(7, "2026-04")).not.toBe(missingFixedRef(7, "2026-03"));
  });
});
