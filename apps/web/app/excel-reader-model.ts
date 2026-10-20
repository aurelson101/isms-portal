import type { Cell, Color, Style, Workbook, Worksheet, ConditionalFormattingOptions } from "exceljs";
import type { CSSProperties } from "react";
import { format } from "ssf";
import { unzipSync, strFromU8 } from "fflate";
import { sheetFilterRange, type SheetRange } from "./sheet-filters";
import type { Locale } from "./i18n/locale";
import { worksheetSavedFilters, type SavedExcelFilter } from "./excel-saved-filters";

export type ExcelCell = { text: string; raw?: string; date?: string; style: CSSProperties };
export type ExcelImage = { id: string; src: string; top: number; left: number; bottom?: number; right?: number; width?: number; height?: number };
export type ExcelRow = { number: number; hidden: boolean; height: number; cells: Record<number, ExcelCell> };
export type ExcelSheet = {
  id: number; name: string; columns: Array<{ index: number; letter: string; width: number }>;
  rows: ExcelRow[]; merges: SheetRange[]; filter: SheetRange | null; truncated: boolean; savedFilters: SavedExcelFilter[]; images: ExcelImage[];
};
export type ExcelBook = { sheets: ExcelSheet[]; activeId: number };

export function excelGroupValues(rows: ExcelRow[], columns: number[]): Map<number, Record<number, string>> {
  const values = new Map<number, Record<number, string>>();
  let previous: Record<number, string> = {};
  for (const row of rows) {
    if (!Object.values(row.cells).some((cell) => cell.text.trim())) {
      previous = {};
      values.set(row.number, {});
      continue;
    }
    const current: Record<number, string> = {};
    for (const column of columns) {
      const text = row.cells[column]?.text || "";
      current[column] = text.trim() ? text : previous[column] || "";
    }
    values.set(row.number, current);
    previous = current;
  }
  return values;
}

const themeDefaults = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];

export function excelColor(color: (Partial<Color> & { indexed?: number; tint?: number }) | undefined, theme = themeDefaults): string | undefined {
  let rgb = color?.argb?.slice(-6);
  if (!rgb && color?.theme !== undefined) rgb = theme[color.theme];
  if (!rgb && color?.indexed !== undefined) rgb = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF"][color.indexed % 8];
  if (!rgb || !/^[a-f0-9]{6}$/i.test(rgb) || color?.indexed === 64) return undefined;
  const tint = Math.max(-1, Math.min(1, color?.tint || 0));
  return "#" + rgb.match(/../g)!.map((part) => {
    const value = parseInt(part, 16);
    return Math.round(tint < 0 ? value * (1 + tint) : value + (255 - value) * tint).toString(16).padStart(2, "0");
  }).join("");
}

export function excelCellStyle(style: Partial<Style>, theme?: string[]): CSSProperties {
  const { font, alignment, fill, border } = style;
  const result: CSSProperties = {
    color: excelColor(font?.color, theme), fontWeight: font?.bold ? 700 : undefined,
    fontStyle: font?.italic ? "italic" : undefined,
    textDecoration: font?.strike ? "line-through" : font?.underline ? "underline" : undefined,
    fontSize: font?.size ? Math.min(48, Math.max(10, font.size * 4 / 3)) : undefined,
    fontFamily: font?.name ? `"${font.name.replace(/[^a-zA-Z0-9 _-]/g, "")}", Arial, sans-serif` : undefined,
    textAlign: alignment?.horizontal === "centerContinuous" ? "center" : ["left", "center", "right", "justify"].includes(alignment?.horizontal || "") ? alignment!.horizontal as CSSProperties["textAlign"] : undefined,
    verticalAlign: alignment?.vertical === "middle" ? "middle" : alignment?.vertical === "top" ? "top" : "bottom",
    whiteSpace: alignment?.wrapText ? "pre-wrap" : "pre",
  };
  if (fill?.type === "pattern" && (fill.pattern === "solid" || !fill.pattern)) result.backgroundColor = excelColor(fill.fgColor || fill.bgColor, theme);
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const edge = border?.[side];
    if (edge?.style) {
      const width = edge.style === "thick" ? 3 : edge.style.startsWith("medium") ? 2 : 1;
      const line = edge.style === "double" ? "double" : /dash/i.test(edge.style) ? "dashed" : edge.style === "dotted" ? "dotted" : "solid";
      const key = `border${side[0].toUpperCase()}${side.slice(1)}` as "borderTop";
      result[key] = `${width}px ${line} ${excelColor(edge.color, theme) || "#333333"}`;
    }
  }
  return result;
}

export function excelCellText(cell: Cell, date1904 = false, locale: Locale = "en"): string {
  let value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date) && "formula" in value) value = value.result ?? null;
  if (value && typeof value === "object" && "sharedFormula" in value) value = value.result ?? null;
  if (value instanceof Date || typeof value === "number") {
    if (value instanceof Date && ["mm-dd-yy", "m/d/yy", "m/d/yyyy"].includes(cell.numFmt))
      return new Intl.DateTimeFormat({ fr: "fr-FR", en: "en-GB", es: "es-ES", sk: "sk-SK" }[locale], { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(value);
    try { return format(cell.numFmt || (value instanceof Date ? "yyyy-mm-dd" : "General"), value, { date1904 }); }
    catch { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value); }
  }
  return cell.text || "";
}

function conditionalStyle(sheet: Worksheet, cell: Cell): Partial<Style> {
  const conditions = (sheet as Worksheet & { conditionalFormattings?: ConditionalFormattingOptions[] }).conditionalFormattings || [];
  const styles: Array<{ priority: number; style: Partial<Style> }> = [];
  for (const condition of conditions) {
    if (!condition.ref.split(/\s+/).some((ref) => {
      const range = sheetFilterRange(ref);
      return range && Number(cell.row) >= range.headerRow && Number(cell.row) <= range.lastRow && Number(cell.col) - 1 >= range.firstColumn && Number(cell.col) - 1 <= range.lastColumn;
    })) continue;
    for (const rule of condition.rules) {
      // Only literal text rules are evaluated. Workbook formulae are never executed.
      if (rule.type === "containsText" && rule.operator === "containsText") {
        const formulae = (rule as typeof rule & { formulae?: string[] }).formulae;
        const text = rule.text || formulae?.[0]?.match(/^NOT\(ISERROR\(SEARCH\("((?:[^"]|"")*)",\s*\$?[A-Z]{1,3}\$?[1-9]\d*\)\)\)$/i)?.[1]?.replace(/""/g, '"');
        if (text && cell.text.toLowerCase().includes(text.toLowerCase()) && rule.style)
          styles.push({ priority: rule.priority || 0, style: rule.style });
      }
    }
  }
  return styles.sort((a, b) => b.priority - a.priority).reduce<Partial<Style>>((result, entry) => ({ ...result, ...Object.fromEntries(Object.entries(entry.style).filter(([, value]) => value !== null)) }), {});
}

export function excelSheetModel(sheet: Worksheet, workbook: Workbook, theme?: string[], savedFilters: SavedExcelFilter[] = [], locale: Locale = "en"): ExcelSheet {
  const tables = sheet.getTables() as unknown as Array<{ table?: { autoFilterRef?: string; tableRef?: string } }>;
  const autoFilter = typeof sheet.autoFilter === "string" ? sheet.autoFilter : null;
  const filter = sheetFilterRange(autoFilter || tables[0]?.table?.autoFilterRef || tables[0]?.table?.tableRef || null);
  const merges = (sheet.model.merges || []).map(sheetFilterRange).filter((range): range is SheetRange => !!range);
  let lastColumn = filter ? filter.lastColumn + 1 : 0;
  let lastRow = filter ? filter.lastRow : 0;
  sheet.eachRow((row, number) => {
    lastRow = Math.max(lastRow, number);
    if (number > 5000) return;
    row.eachCell((cell, column) => { if (cell.value !== null && cell.value !== undefined) { lastColumn = Math.max(lastColumn, column); lastRow = Math.max(lastRow, number); } });
  });
  for (const range of merges) {
    if (range.headerRow <= lastRow && sheet.getCell(range.headerRow, range.firstColumn + 1).text) {
      lastColumn = Math.max(lastColumn, range.lastColumn + 1);
      lastRow = Math.max(lastRow, range.lastRow);
    }
  }
  const columns = Array.from({ length: Math.min(128, lastColumn) }, (_, index) => {
    const column = sheet.getColumn(index + 1);
    return { index, letter: column.letter, width: Math.max(12, Math.min(500, (column.width || 8.43) * 7 + 5)), hidden: column.hidden };
  }).filter((column) => !column.hidden);
  const cellColumns = [...new Set([...columns.map((column) => column.index), ...savedFilters.map((filter) => filter.column)])].filter((column) => column < 128);
  const rows = Array.from({ length: Math.min(5000, lastRow) }, (_, index) => {
    const row = sheet.getRow(index + 1);
    const cells: Record<number, ExcelCell> = {};
    for (const column of cellColumns) {
      const cell = row.getCell(column + 1);
      const master = cell.isMerged ? cell.master : cell;
      const conditional = conditionalStyle(sheet, master);
      let value = master.value;
      if (value && typeof value === "object" && "result" in value) value = value.result ?? null;
      const raw = value instanceof Date ? String((value.getTime() - Date.UTC(1899, 11, 30)) / 86400000 - (workbook.properties.date1904 ? 1462 : 0)) : typeof value === "boolean" ? value ? "1" : "0" : typeof value === "number" ? String(value) : master.text;
      cells[column] = { text: excelCellText(master, workbook.properties.date1904, locale), raw, date: value instanceof Date ? value.toISOString() : undefined, style: excelCellStyle({ ...master.style, ...conditional, font: { ...master.font, ...conditional.font } }, theme) };
    }
    return { number: index + 1, hidden: !!row.hidden, height: Math.max(18, Math.min(180, (row.height || 15) * 4 / 3)), cells };
  });
  const images: ExcelImage[] = [];
  let imageBytes = 0;
  for (const embedded of sheet.getImages().slice(0, 20)) {
    const image = workbook.getImage(Number(embedded.imageId));
    let data: Uint8Array | null;
    try { data = image?.buffer ? new Uint8Array(image.buffer) : image?.base64 ? Uint8Array.from(atob(image.base64.replace(/^data:[^,]+,/, "")), (char) => char.charCodeAt(0)) : null; }
    catch { continue; }
    if (!data || data.length > 2 * 1024 * 1024 || imageBytes + data.length > 8 * 1024 * 1024) continue;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value);
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    if (!png && !jpeg) continue;
    const range = embedded.range as typeof embedded.range & { ext?: { width: number; height: number } };
    if (!Number.isFinite(range.tl.row) || !Number.isFinite(range.tl.col) || range.tl.row < 0 || range.tl.col < 0 || range.tl.row >= 5000 || range.tl.col >= 128) continue;
    let binary = "";
    for (let at = 0; at < data.length; at += 32768) binary += String.fromCharCode(...data.subarray(at, at + 32768));
    images.push({ id: embedded.imageId, src: `data:image/${png ? "png" : "jpeg"};base64,${btoa(binary)}`, top: range.tl.row, left: range.tl.col, bottom: range.br?.row, right: range.br?.col, width: range.ext?.width, height: range.ext?.height });
    imageBytes += data.length;
  }
  return { id: sheet.id, name: sheet.name, columns, rows, merges, filter, savedFilters, images, truncated: lastRow > 5000 || lastColumn > 128 };
}

export async function readExcelBook(bytes: ArrayBuffer, locale: Locale = "en"): Promise<ExcelBook> {
  let expanded = 0;
  let entries = 0;
  const metadata = unzipSync(new Uint8Array(bytes), { filter: (entry) => {
    expanded += entry.originalSize;
    if (++entries > 1500 || entry.originalSize > 16 * 1024 * 1024 || expanded > 48 * 1024 * 1024) throw new Error("Workbook preview limit");
    return entry.name === "xl/theme/theme1.xml" || entry.name === "xl/workbook.xml" || entry.name === "xl/_rels/workbook.xml.rels" || /^xl\/(worksheets\/sheet\d+\.xml|worksheets\/_rels\/sheet\d+\.xml\.rels|tables\/table\d+\.xml)$/.test(entry.name);
  } });
  let theme = themeDefaults;
  if (metadata["xl/theme/theme1.xml"] && typeof DOMParser !== "undefined") {
    const xml = new DOMParser().parseFromString(strFromU8(metadata["xl/theme/theme1.xml"]), "application/xml");
    const scheme = xml.getElementsByTagNameNS("*", "clrScheme")[0];
    if (scheme) {
      const colors = Array.from(scheme.childNodes).filter((node): node is Element => node.nodeType === 1).map((item) => {
        const child = Array.from(item.childNodes).find((node) => node.nodeType === 1) as Element | undefined;
        return child?.getAttribute("lastClr") || child?.getAttribute("val") || "";
      });
      // Spreadsheet theme indices start with light/dark, unlike the theme XML order.
      theme = [colors[1], colors[0], colors[3], colors[2], ...colors.slice(4)];
    }
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as Parameters<typeof workbook.xlsx.load>[0]);
  const visible = workbook.worksheets.filter((sheet) => sheet.state === "visible");
  const sheets = visible.map((sheet) => excelSheetModel(sheet, workbook, theme, worksheetSavedFilters(metadata, sheet.name), locale));
  if (!sheets.length) throw new Error("No visible worksheet");
  const active = workbook.worksheets[workbook.views?.[0]?.activeTab ?? -1];
  return { sheets, activeId: sheets.find((sheet) => sheet.id === active?.id)?.id ?? sheets.find((sheet) => sheet.filter)?.id ?? sheets[0].id };
}
