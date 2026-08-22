import { describe, expect, it } from "vitest";
import {
  buildItemIndex,
  suggestItems,
  type IndexableExpense,
} from "@/lib/autocomplete";

function expense(overrides: Partial<IndexableExpense> = {}): IndexableExpense {
  return {
    item: "Rema 1000",
    price: 400,
    category_id: 2,
    tag: null,
    date: "2026-08-01",
    ...overrides,
  };
}

describe("buildItemIndex", () => {
  it("groups case-insensitively and ignores surrounding whitespace", () => {
    const index = buildItemIndex([
      expense({ item: "Rema 1000" }),
      expense({ item: "  rema 1000  " }),
    ]);

    expect(index).toHaveLength(1);
    expect(index[0].count).toBe(2);
  });

  it("displays the most recent spelling of the item", () => {
    const index = buildItemIndex([
      expense({ item: "REMA 1000", date: "2026-07-01" }),
      expense({ item: "Rema 1000", date: "2026-08-01" }),
    ]);

    expect(index[0].item).toBe("Rema 1000");
  });

  it("takes the category from the most recent entry", () => {
    const index = buildItemIndex([
      expense({ category_id: 9, date: "2026-06-01" }),
      expense({ category_id: 4, date: "2026-08-01" }),
    ]);

    expect(index[0].categoryId).toBe(4);
  });

  it("uses the median price for an odd number of entries", () => {
    const index = buildItemIndex([
      expense({ price: 100 }),
      expense({ price: 900 }),
      expense({ price: 300 }),
    ]);

    expect(index[0].price).toBe(300);
  });

  it("rounds the median to whole kroner for an even number of entries", () => {
    const index = buildItemIndex([
      expense({ price: 100 }),
      expense({ price: 105 }),
    ]);

    expect(index[0].price).toBe(103);
  });

  it("picks the most frequent tag", () => {
    const index = buildItemIndex([
      expense({ tag: "ferie" }),
      expense({ tag: "mat" }),
      expense({ tag: "mat" }),
    ]);

    expect(index[0].tag).toBe("mat");
  });

  it("reports a null tag when no entry has one", () => {
    const index = buildItemIndex([expense({ tag: null }), expense({ tag: "" })]);

    expect(index[0].tag).toBeNull();
  });

  it("orders the most-used items first", () => {
    const index = buildItemIndex([
      expense({ item: "Kino" }),
      expense({ item: "Rema 1000" }),
      expense({ item: "Rema 1000" }),
    ]);

    expect(index.map((entry) => entry.item)).toEqual(["Rema 1000", "Kino"]);
  });

  it("skips entries with a blank description", () => {
    const index = buildItemIndex([expense({ item: "   " }), expense()]);

    expect(index).toHaveLength(1);
  });
});

describe("suggestItems", () => {
  const index = buildItemIndex([
    expense({ item: "Rema 1000" }),
    expense({ item: "Kiwi" }),
    expense({ item: "Bakeri Rema" }),
  ]);

  it("returns nothing for an empty query", () => {
    expect(suggestItems(index, "   ")).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(suggestItems(index, "KIWI").map((s) => s.item)).toEqual(["Kiwi"]);
  });

  it("ranks prefix matches above substring matches", () => {
    expect(suggestItems(index, "rema").map((s) => s.item)).toEqual([
      "Rema 1000",
      "Bakeri Rema",
    ]);
  });

  it("respects the limit", () => {
    expect(suggestItems(index, "e", 1)).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(suggestItems(index, "zzzz")).toEqual([]);
  });
});
