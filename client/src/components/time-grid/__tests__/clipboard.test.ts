import { describe, it, expect } from "vitest";
import {
  parseClipboard,
  parseCsv,
  coerceDate,
  coerceHours,
  coerceBoolean,
} from "../clipboard";

describe("parseClipboard", () => {
  it("returns an empty array for empty input", () => {
    expect(parseClipboard("")).toEqual([]);
  });

  it("detects TSV when the payload contains a tab and splits on tabs", () => {
    const tsv = "2024-01-01\tProject A\t8\n2024-01-02\tProject B\t4";
    expect(parseClipboard(tsv)).toEqual([
      ["2024-01-01", "Project A", "8"],
      ["2024-01-02", "Project B", "4"],
    ]);
  });

  it("normalizes Windows CRLF line endings before parsing TSV", () => {
    const tsv = "a\tb\r\nc\td\r\n";
    // trailing empty line from CRLF should be dropped
    expect(parseClipboard(tsv)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("falls back to CSV parsing when no tab is present", () => {
    const csv = "2024-01-01,Project A,8\n2024-01-02,Project B,4";
    expect(parseClipboard(csv)).toEqual([
      ["2024-01-01", "Project A", "8"],
      ["2024-01-02", "Project B", "4"],
    ]);
  });

  it("does NOT fall back to CSV when even a single tab is present", () => {
    // Mixed payloads should be treated as TSV (Excel/Sheets behavior)
    const mixed = "a,b\tc";
    expect(parseClipboard(mixed)).toEqual([["a,b", "c"]]);
  });
});

describe("parseCsv", () => {
  it("preserves commas inside quoted fields", () => {
    const csv = '"Smith, John",8,"Bug fix, urgent"';
    expect(parseCsv(csv)).toEqual([["Smith, John", "8", "Bug fix, urgent"]]);
  });

  it("supports escaped quotes via doubled double-quotes", () => {
    const csv = '"He said ""hi""",ok';
    expect(parseCsv(csv)).toEqual([['He said "hi"', "ok"]]);
  });

  it("supports newlines embedded in quoted fields", () => {
    const csv = '"line1\nline2",next';
    expect(parseCsv(csv)).toEqual([["line1\nline2", "next"]]);
  });

  it("parses multi-row CSV with mixed quoted and unquoted fields", () => {
    const csv = 'a,"b,c",d\n1,2,"3,4"';
    expect(parseCsv(csv)).toEqual([
      ["a", "b,c", "d"],
      ["1", "2", "3,4"],
    ]);
  });
});

describe("coerceDate", () => {
  it("accepts canonical YYYY-MM-DD as-is", () => {
    expect(coerceDate("2024-03-15")).toBe("2024-03-15");
  });

  it("expands M/D/YY to a four-digit year", () => {
    expect(coerceDate("3/5/24")).toBe("2024-03-05");
  });

  it("expands M/D/YYYY without zero padding", () => {
    expect(coerceDate("12/9/2024")).toBe("2024-12-09");
  });

  it("uses the current year for M/D shorthand", () => {
    const current = new Date().getFullYear();
    expect(coerceDate("4/7")).toBe(`${current}-04-07`);
  });

  it("rejects invalid month/day numbers", () => {
    expect(coerceDate("13/40/2024")).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(coerceDate("not a date")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(coerceDate("")).toBeNull();
  });
});

describe("coerceHours", () => {
  it("rounds to two decimals", () => {
    expect(coerceHours("1.234")).toBe(1.23);
    expect(coerceHours("1.236")).toBe(1.24);
  });

  it("trims whitespace and parses decimals", () => {
    expect(coerceHours("  7.5  ")).toBe(7.5);
  });

  it("rejects values <= 0", () => {
    expect(coerceHours("0")).toBeNull();
    expect(coerceHours("-3")).toBeNull();
  });

  it("rejects values > 24", () => {
    expect(coerceHours("25")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(coerceHours("abc")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(coerceHours("")).toBeNull();
  });
});

describe("coerceBoolean", () => {
  it.each(["true", "TRUE", "Yes", "y", "1", "billable"])(
    "treats %s as true",
    (val) => {
      expect(coerceBoolean(val)).toBe(true);
    },
  );

  it.each(["false", "FALSE", "No", "n", "0", "non-billable", "nonbillable"])(
    "treats %s as false",
    (val) => {
      expect(coerceBoolean(val)).toBe(false);
    },
  );

  it("returns null for unrecognized strings", () => {
    expect(coerceBoolean("maybe")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(coerceBoolean("")).toBeNull();
  });
});
