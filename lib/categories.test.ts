import { describe, expect, it } from "vitest";
import {
  CATEGORY_KINDS,
  KIND_LABELS,
  isIncomeKind,
  isSavingsKind,
  isSpendingKind,
  toCategoryKind,
} from "@/lib/categories";

describe("toCategoryKind", () => {
  it("passes through every known kind", () => {
    CATEGORY_KINDS.forEach((kind) => {
      expect(toCategoryKind(kind)).toBe(kind);
    });
  });

  it("falls back to variable for an unknown string", () => {
    expect(toCategoryKind("sparing")).toBe("variable");
  });

  it("falls back to variable for null and undefined", () => {
    expect(toCategoryKind(null)).toBe("variable");
    expect(toCategoryKind(undefined)).toBe("variable");
  });

  it("falls back to variable for a non-string", () => {
    expect(toCategoryKind(3)).toBe("variable");
  });
});

describe("kind predicates", () => {
  it("treats only income as income", () => {
    expect(isIncomeKind("income")).toBe(true);
    expect(isIncomeKind("fixed")).toBe(false);
    expect(isIncomeKind("variable")).toBe(false);
    expect(isIncomeKind("savings")).toBe(false);
  });

  it("treats fixed and variable as spending", () => {
    expect(isSpendingKind("fixed")).toBe(true);
    expect(isSpendingKind("variable")).toBe(true);
  });

  it("does not treat income or savings as spending", () => {
    // A transfer to savings is not consumption — this is the whole point of
    // the savings kind.
    expect(isSpendingKind("income")).toBe(false);
    expect(isSpendingKind("savings")).toBe(false);
  });

  it("treats only savings as savings", () => {
    expect(isSavingsKind("savings")).toBe(true);
    expect(isSavingsKind("variable")).toBe(false);
  });
});

describe("KIND_LABELS", () => {
  it("labels every kind in Norwegian", () => {
    CATEGORY_KINDS.forEach((kind) => {
      expect(KIND_LABELS[kind]).toBeTruthy();
    });
  });
});
