import { describe, expect, it } from "vitest";
import { expenseKey, guessKind, parseExpenseCsv } from "./importExpenses";

// The round trip that has to hold: the headers our own CSV export writes.
const exported = [
  "Dato,Merkelapp,Beskrivelse,Beløp,Kategori",
  "2026-09-15,Fast,Lånekassen,-3005,Lån",
  "2026-09-01,,Lønn,42000,Inntekt",
].join("\n");

describe("parseExpenseCsv", () => {
  it("reads back what the activity table exports", () => {
    const result = parseExpenseCsv(exported);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    // Prices are stored unsigned; the category's kind carries the direction.
    expect(result.rows[0]).toMatchObject({
      date: "2026-09-15",
      item: "Lånekassen",
      price: 3005,
      category: "Lån",
      tag: "Fast",
      incoming: false,
    });
    expect(result.categories).toEqual(["Lån", "Inntekt"]);
    expect(result.signed).toBe(true);
  });

  it("takes a semicolon file with dotted dates and kroner labels", () => {
    const result = parseExpenseCsv(
      "dato;tekst;beløp\n22.09.26;Kaffe;-1 234,50 kr\n"
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      date: "2026-09-22",
      price: 1234,
      category: "",
      tag: null,
    });
  });

  it("names the line of every row it skips", () => {
    const result = parseExpenseCsv(
      ["dato,beskrivelse,beløp", "ikke-en-dato,Kaffe,-50", "2026-09-02,,-50", "2026-09-02,Kaffe,tull", "2026-09-02,Kaffe,0"].join("\n")
    );
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(4);
    expect(result.errors.every((line, i) => line.startsWith(`Linje ${i + 2}:`))).toBe(true);
  });

  it("refuses a file without the three required columns", () => {
    const result = parseExpenseCsv("konto;saldo\nBSU;1000");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("guessKind", () => {
  const rows = parseExpenseCsv(exported).rows;

  it("calls an all-positive category income when the file is signed", () => {
    expect(guessKind(rows, "Inntekt", true)).toBe("income");
    expect(guessKind(rows, "Lån", true)).toBe("variable");
  });

  it("guesses nothing from a file that only has one sign", () => {
    expect(guessKind(rows, "Inntekt", false)).toBe("variable");
  });
});

describe("expenseKey", () => {
  it("matches a re-imported row regardless of case and padding", () => {
    expect(
      expenseKey({ date: "2026-09-15", item: " Lånekassen ", price: 3005, category: "Lån" })
    ).toBe(expenseKey({ date: "2026-09-15", item: "lånekassen", price: 3005, category: "LÅN" }));
  });
});
