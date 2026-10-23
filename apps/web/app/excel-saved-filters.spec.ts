import { afterEach, describe, expect, it, vi } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import ExcelJS from "exceljs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { matchesSavedExcelFilter, parseSavedFilters, worksheetSavedFilters } from "./excel-saved-filters";
import { excelCellText, excelSheetModel, readExcelBook } from "./excel-reader-model";

const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
afterEach(() => vi.unstubAllGlobals());

describe("saved workbook filters and cover fidelity", () => {
  it.each(["http://[", "https://external.example/sheet.xml"])("ignores unsafe workbook relationships: %s", (target) => {
    vi.stubGlobal("DOMParser", DOMParser);
    const parts = {
      "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Matrix" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="${target}"/></Relationships>`),
    };
    expect(worksheetSavedFilters(parts, "Matrix")).toEqual([]);
  });
  it("does not confuse filter buttons with saved filter criteria", () => {
    expect(parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0" hiddenButton="0"/></autoFilter></worksheet>'))).toEqual([]);
  });
  it("loads multiple selected values and blanks with the correct column offset", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="B9:F20"><filterColumn colId="3"><filters blank="1"><filter val="Public"/><filter val="Internal"/></filters></filterColumn></autoFilter></worksheet>'));
    expect(filter.column).toBe(4);
    expect(matchesSavedExcelFilter({ text: "PUBLIC" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "Internal" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "Confidential" }, filter)).toBe(false);
  });
  it("supports numeric AND criteria using raw values rather than formatted text", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0"><customFilters and="1"><customFilter operator="greaterThanOrEqual" val="10"/><customFilter operator="lessThan" val="20"/></customFilters></filterColumn></autoFilter></worksheet>'));
    expect(matchesSavedExcelFilter({ text: "12,00 EUR", raw: "12" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "25,00 EUR", raw: "25" }, filter)).toBe(false);
  });
  it.each([
    { text: "50%", raw: "0.5" },
    { text: "0012", raw: "12" },
    { text: "12,00 EUR", raw: "12" },
  ])("matches a saved selection against formatted cell text: $text", cell => {
    const original = { ...cell };
    expect(matchesSavedExcelFilter(cell, { column: 0, values: [cell.text] })).toBe(true);
    expect(matchesSavedExcelFilter(cell, { column: 0, values: [cell.raw] })).toBe(true);
    expect(matchesSavedExcelFilter(cell, { column: 0, values: ["unmatched"] })).toBe(false);
    expect(cell).toEqual(original);
  });
  it("keeps regular saved selections exact rather than substring matches", () => {
    expect(matchesSavedExcelFilter({ text: "Highly Confidential", raw: "Highly Confidential" }, { column: 0, values: ["Confidential"] })).toBe(false);
  });
  it("restores a formatted percentage selection from an actual XLSX container", async () => {
    vi.stubGlobal("DOMParser", DOMParser);
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Percentages");
    sheet.addRows([["Ratio"], [0.5], [0.75]]); sheet.autoFilter = "A1:A3";
    sheet.getCell("A2").numFmt = "0%"; sheet.getCell("A3").numFmt = "0%";
    const parts = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()));
    parts["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(parts["xl/worksheets/sheet1.xml"]).replace(/<autoFilter[^>]*\/>/, '<autoFilter ref="A1:A3"><filterColumn colId="0"><filters><filter val="50%"/></filters></filterColumn></autoFilter>'));
    const bytes = zipSync(parts); const original = bytes.slice();
    const result = await readExcelBook(bytes.buffer as ArrayBuffer, "fr");
    const model = result.sheets[0]; const filter = model.savedFilters[0];
    expect(model.rows[1].cells[0].text).toBe("50%");
    expect(matchesSavedExcelFilter(model.rows[1].cells[0], filter)).toBe(true);
    expect(matchesSavedExcelFilter(model.rows[2].cells[0], filter)).toBe(false);
    expect(bytes).toEqual(original);
  });
  it("compares numerically equivalent decimal criteria correctly", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0"><customFilters><customFilter operator="equal" val="12.0"/></customFilters></filterColumn></autoFilter></worksheet>'));
    expect(matchesSavedExcelFilter({ text: "12,00", raw: "12" }, filter)).toBe(true);
    filter.custom!.rules[0].operator = "notEqual";
    expect(matchesSavedExcelFilter({ text: "12,00", raw: "12" }, filter)).toBe(false);
  });
  it("supports wildcard text filters without evaluating regular expressions", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0"><customFilters><customFilter val="pub*"/></customFilters></filterColumn></autoFilter></worksheet>'));
    expect(matchesSavedExcelFilter({ text: "Public" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "Internal" }, filter)).toBe(false);
    filter.custom!.rules[0].value = "A~*?";
    expect(matchesSavedExcelFilter({ text: "A*B" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "AB" }, filter)).toBe(false);
  });
  it("supports saved date groups", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0"><filters><dateGroupItem year="2026" month="3" dateTimeGrouping="month"/></filters></filterColumn></autoFilter></worksheet>'));
    expect(matchesSavedExcelFilter({ text: "13/03/2026", date: "2026-03-13T00:00:00Z" }, filter)).toBe(true);
    expect(matchesSavedExcelFilter({ text: "19/10/2026", date: "2026-10-19T00:00:00Z" }, filter)).toBe(false);
  });
  it("marks color and other unsupported criteria for saved-row fallback", () => {
    const [filter] = parseSavedFilters(parse('<worksheet><autoFilter ref="A1:A20"><filterColumn colId="0"><colorFilter dxfId="1"/></filterColumn></autoFilter></worksheet>'));
    expect(filter.unsupported).toBe(true);
  });
  it("reads a saved XLSX filter even when the ExcelJS API discards its criteria", async () => {
    vi.stubGlobal("DOMParser", DOMParser);
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Matrix");
    sheet.addRows([["Level"], ["Public"], ["Internal"], ["Confidential"]]); sheet.autoFilter = "A1:A4"; sheet.getRow(4).hidden = true;
    const parts = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const source = strFromU8(parts["xl/worksheets/sheet1.xml"]);
    parts["xl/worksheets/sheet1.xml"] = strToU8(source.replace(/<autoFilter[^>]*\/>/, '<autoFilter ref="A1:A4"><filterColumn colId="0"><filters><filter val="Public"/><filter val="Internal"/></filters></filterColumn></autoFilter>'));
    const result = await readExcelBook(zipSync(parts).buffer as ArrayBuffer, "fr");
    expect(result.sheets[0].savedFilters[0].values).toEqual(["Public", "Internal"]);
    expect(result.sheets[0].rows[3].hidden).toBe(true);
  });
  it("does not follow external workbook relationships", () => {
    vi.stubGlobal("DOMParser", DOMParser);
    const parts = { "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Matrix" r:id="x"/></sheets></workbook>'), "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="x" Target="https://invalid.example/worksheet.xml" TargetMode="External"/></Relationships>') };
    expect(worksheetSavedFilters(parts, "Matrix")).toEqual([]);
  });
  it("localizes Excel's built-in date format without swapping the date", () => {
    const cell = new ExcelJS.Workbook().addWorksheet("Cover").getCell("A1");
    cell.value = new Date("2026-03-13T00:00:00Z"); cell.numFmt = "mm-dd-yy";
    expect(excelCellText(cell, false, "fr")).toBe("13/03/2026");
  });
  it("includes only validated embedded raster images", () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Cover"); sheet.getCell("A1").value = "Cover";
    const png = workbook.addImage({ base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=", extension: "png" });
    const invalid = workbook.addImage({ base64: btoa('<svg onload="alert(1)"/>'), extension: "png" });
    sheet.addImage(png, { tl: { col: 0, row: 0 }, ext: { width: 50, height: 30 } });
    sheet.addImage(invalid, { tl: { col: 0, row: 0 }, ext: { width: 50, height: 30 } });
    const model = excelSheetModel(sheet, workbook);
    expect(model.images).toHaveLength(1);
    expect(model.images[0].src.startsWith("data:image/png;base64,")).toBe(true);
    expect(model.images[0].width).toBe(50);
  });
});
