import { describe, expect, it } from "vitest";
import { escapeCsvField, toCsv } from "@/lib/csv";

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
