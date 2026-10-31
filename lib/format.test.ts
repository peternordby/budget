import { describe, expect, it } from "vitest";
import { columnName } from "@/lib/format";

describe("columnName", () => {
  it("counts like a spreadsheet: no zero digit, so Z rolls over to AA", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      "A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
    ]);
  });
});
