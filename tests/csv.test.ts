import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("csv serialisation", () => {
  it("emits a header row from the first record", () => {
    expect(toCsv([{ a: 1, b: "x" }])).toBe("a,b\n1,x");
  });

  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv([{ a: 'he said "hi", loudly', b: "line1\nline2" }]);
    expect(csv).toContain('"he said ""hi"", loudly"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"http://evil\")", b: "+1", c: "-2", d: "@SUM(A1)" }]);
    const [, row] = csv.split("\n");
    expect(row!.startsWith("\"'=HYPERLINK")).toBe(true);
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@SUM(A1)");
  });

  it("leaves ordinary values untouched", () => {
    expect(toCsv([{ a: "Jane Doe", b: 42 }])).toBe("a,b\nJane Doe,42");
  });

  it("honours an explicit column list and blanks missing values", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b", "c"])).toBe("b,c\n2,");
  });

  it("returns nothing for an empty dataset", () => {
    expect(toCsv([])).toBe("");
  });
});
