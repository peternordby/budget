import { describe, expect, it } from "vitest";
import { escapeCsvField, parseCsv, sniffDelimiter, toCsv } from "@/lib/csv";

describe("escapeCsvField", () => {
  it("leaves a plain value alone", () => {
    expect(escapeCsvField("Rema 1000")).toBe("Rema 1000");
  });

  it("renders null as empty", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("renders a number without quotes", () => {
    expect(escapeCsvField(1234)).toBe("1234");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvField("Mat, drikke")).toBe('"Mat, drikke"');
  });

  it("quotes and doubles an embedded quote", () => {
    expect(escapeCsvField('Kafé "Oslo"')).toBe('"Kafé ""Oslo"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvField("linje1\nlinje2")).toBe('"linje1\nlinje2"');
  });

  it("quotes a value containing a carriage return", () => {
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2");
  });

  it("emits only headers for no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });

  it("escapes every field", () => {
    expect(toCsv(["desc"], [['x,y']])).toBe('desc\r\n"x,y"');
  });
});

describe("sniffDelimiter", () => {
  it("defaults to comma", () => {
    expect(sniffDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("finds the semicolon Norwegian Excel writes", () => {
    expect(sniffDelimiter("dato;kategori;beløp\n2026-08-01;Fond;1")).toBe(";");
  });

  it("finds tabs", () => {
    expect(sniffDelimiter("a\tb\tc")).toBe("\t");
  });

  it("ignores delimiters inside quoted fields", () => {
    // One real semicolon; the two commas are inside quotes.
    expect(sniffDelimiter('"Fond, globalt";beløp')).toBe(";");
  });

  it("falls back to comma for a single-column file", () => {
    expect(sniffDelimiter("kolonne")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("parses a simple table", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps blank fields", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("handles quoted fields containing the delimiter", () => {
    expect(parseCsv('a,b\n"x,y",z')).toEqual([
      ["a", "b"],
      ["x,y", "z"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",z')).toEqual([
      ["a", "b"],
      ["line1\nline2", "z"],
    ]);
  });

  it("accepts CRLF, LF and lone CR line endings", () => {
    const expected = [
      ["a", "b"],
      ["1", "2"],
    ];
    expect(parseCsv("a,b\r\n1,2")).toEqual(expected);
    expect(parseCsv("a,b\n1,2")).toEqual(expected);
    expect(parseCsv("a,b\r1,2")).toEqual(expected);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });

  it("drops trailing blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("flushes a final record with no trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips what toCsv produces", () => {
    const headers = ["dato", "kategori", "beløp"];
    const rows = [
      ["2026-08-01", 'Fond, "globalt"', 118000],
      ["2026-08-01", "BSU", 45000],
    ];
    const parsed = parseCsv(toCsv(headers, rows as (string | number)[][]));
    expect(parsed[0]).toEqual(headers);
    expect(parsed[1]).toEqual(["2026-08-01", 'Fond, "globalt"', "118000"]);
    expect(parsed[2]).toEqual(["2026-08-01", "BSU", "45000"]);
  });
});
