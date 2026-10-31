import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import { excelCellText, excelColor, excelFilterOptions, excelGroupValues, excelSheetModel, readExcelBook } from "./excel-reader-model";

describe("formatted read-only Excel reader", () => {
  it("builds numeric-sorted filter options only from the filter data range", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Filters");
    sheet.addRows([["Title", ""], ["Item", "Owner"], ["Item 10", "B"], ["Item 2", "A"], ["Outside", "Z"]]);
    sheet.autoFilter = "A2:B4";
    const model = excelSheetModel(sheet, book);
    const before = JSON.stringify(model);
    const options = excelFilterOptions(model, "en");
    expect(options[model.columns[0].index]).toEqual(["Item 2", "Item 10"]);
    expect(options[model.columns[1].index]).toEqual(["A", "B"]);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("has no filter options for missing sheets or sheets without filters", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Plain"); sheet.addRow(["Value"]);
    expect(excelFilterOptions(undefined, "fr")).toEqual({});
    expect(excelFilterOptions(excelSheetModel(sheet, book), "fr")).toEqual({});
  });
  it("reports truncation even when the only value is beyond the preview row limit", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Long");
    sheet.getCell("A5001").value = "Outside preview";
    const model = excelSheetModel(sheet, book);
    expect(model.truncated).toBe(true);
    expect(model.rows).toHaveLength(5000);
    expect(model.rows.some((row) => row.number > 5000)).toBe(false);
  });
  it("extends group values without changing cells and stops at empty rows or the next value", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Groups");
    sheet.getCell("A1").value = "Owner A";
    sheet.getCell("B2").value = "Detail A";
    sheet.getCell("A3").value = "Owner B";
    sheet.getCell("B4").value = "Detail B";
    sheet.getCell("B6").value = "Ungrouped";
    const rows = excelSheetModel(sheet, book).rows;
    const before = JSON.stringify(rows);
    const groups = excelGroupValues(rows, [0]);
    expect(groups.get(2)?.[0]).toBe("Owner A");
    expect(groups.get(4)?.[0]).toBe("Owner B");
    expect(groups.get(6)?.[0]).toBe("");
    expect(rows[1].cells[0].text).toBe("");
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("preserves merged cells, hidden columns, widths and direct formatting", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Matrix");
    sheet.getCell("B2").value = "Classification";
    sheet.getCell("B2").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    sheet.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
    sheet.mergeCells("B2:D2"); sheet.getColumn(3).hidden = true; sheet.getColumn(2).width = 25;
    const model = excelSheetModel(sheet, book);
    expect(model.columns.map((column) => column.index)).toEqual([0, 1, 3]);
    expect(model.columns[1].width).toBe(180);
    expect(model.merges[0]).toEqual({ firstColumn: 1, lastColumn: 3, headerRow: 2, lastRow: 2 });
    expect(model.rows[1].cells[1].style).toMatchObject({ fontWeight: 700, color: "#ffffff", backgroundColor: "#c00000" });
    expect(model.rows[1].cells[3].text).toBe("Classification");
  });
  it("formats dates, percentages and cached formula values without evaluating formulas", () => {
    const sheet = new ExcelJS.Workbook().addWorksheet("Formats");
    sheet.getCell("A1").value = new Date("2026-10-19T00:00:00Z"); sheet.getCell("A1").numFmt = "dd/mm/yyyy";
    sheet.getCell("A2").value = 0.25; sheet.getCell("A2").numFmt = "0%";
    sheet.getCell("A3").value = { formula: "1+1", result: 2 };
    sheet.getCell("A4").value = { formula: "HYPERLINK(\"https://invalid.example\",\"external\")" };
    expect(excelCellText(sheet.getCell("A1"))).toBe("19/10/2026");
    expect(excelCellText(sheet.getCell("A2"))).toBe("25%");
    expect(excelCellText(sheet.getCell("A3"))).toBe("2");
    expect(excelCellText(sheet.getCell("A4"))).toBe("");
  });
  it("preserves text-based conditional colors without running expressions", () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Rules");
    sheet.getCell("A1").value = "Confidential";
    sheet.addConditionalFormatting({ ref: "A1:A2", rules: [{ type: "containsText", operator: "containsText", text: "Confidential", priority: 1, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } } } }] });
    expect(excelSheetModel(sheet, book).rows[0].cells[0].style.backgroundColor).toBe("#ffc7ce");
  });
  it("loads a real XLSX, ignores hidden worksheets and detects table filters", async () => {
    const book = new ExcelJS.Workbook(); book.addWorksheet("Cover").getCell("A1").value = "Cover";
    const sheet = book.addWorksheet("Matrix");
    sheet.addTable({ name: "Classification", ref: "B9", headerRow: true, columns: [{ name: "Level" }], rows: [["Public"], ["Internal"]] });
    book.addWorksheet("Hidden", { state: "veryHidden" }).getCell("A1").value = "Not published";
    const source = await book.xlsx.writeBuffer();
    const before = Buffer.from(source);
    const result = await readExcelBook(source as unknown as ArrayBuffer);
    expect(result.sheets.map((entry) => entry.name)).toEqual(["Cover", "Matrix"]);
    expect(result.activeId).toBe(sheet.id);
    expect(result.sheets[1].filter).toMatchObject({ headerRow: 9, firstColumn: 1, lastRow: 11 });
    expect(Buffer.from(source).equals(before)).toBe(true);
  });
  it("rejects decompression bombs before parsing the workbook", async () => {
    const zip = zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(17 * 1024 * 1024), "[Content_Types].xml": strToU8("<Types/>") });
    await expect(readExcelBook(zip.buffer as ArrayBuffer)).rejects.toThrow("Workbook preview limit");
  });
  it("restores conditional formatting after an actual XLSX save and reload", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Colors");
    sheet.getCell("A1").value = "Public";
    sheet.addConditionalFormatting({ ref: "A1", rules: [{ type: "containsText", operator: "containsText", text: "Public", priority: 1, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } } } }] });
    const bytes = await book.xlsx.writeBuffer();
    const model = await readExcelBook(bytes as unknown as ArrayBuffer);
    expect(model.sheets[0].rows[0].cells[0].style.backgroundColor).toBe("#c6efce");
  });
  it("validates colors instead of accepting arbitrary CSS values", () => {
    expect(excelColor({ argb: "FF8EB4E3" })).toBe("#8eb4e3");
    expect(excelColor({ argb: "url(evil)" })).toBeUndefined();
    expect(excelColor({ argb: "FF000000", tint: 0.5 })).toBe("#808080");
  });
});
