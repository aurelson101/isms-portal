import { describe, expect, it } from "vitest";
import {
  matchesSheetFilters,
  sheetColumn,
  sheetFilterRange,
} from "./sheet-filters";

describe("read-only spreadsheet filters", () => {
  it("recognizes saved filter ranges and non-first-row headers", () => {
    expect(sheetFilterRange("$B$3:$AD$250")).toEqual({
      firstColumn: 1,
      lastColumn: 29,
      headerRow: 3,
      lastRow: 250,
    });
    expect(sheetColumn("XFD")).toBe(16383);
  });
  it("rejects malformed, reversed and out-of-bounds ranges", () => {
    for (const ref of [
      null,
      "A0:B2",
      "B2:A1",
      "XFE1:XFE2",
      "A1:B1048577",
      "../A1",
      "A1:B2 C1:D2",
    ])
      expect(sheetFilterRange(ref)).toBeNull();
  });
  it("combines filters without changing cell values or the source array", () => {
    const row = Object.freeze([
      "Confidential",
      "Finance",
    ]) as unknown as string[];
    expect(matchesSheetFilters(row, { 0: " confidential ", 1: "FIN" })).toBe(
      true,
    );
    expect(matchesSheetFilters(row, { 0: "public" })).toBe(false);
    expect(matchesSheetFilters(row, { 2: "value" })).toBe(false);
    expect(matchesSheetFilters(row, {})).toBe(true);
    expect(row).toEqual(["Confidential", "Finance"]);
  });
});
