import { strFromU8 } from "fflate";
import { sheetFilterRange } from "./sheet-filters";

export type SavedExcelFilter = {
  column: number; values?: string[]; blank?: boolean;
  dates?: Array<Record<string, number>>;
  custom?: { and: boolean; rules: Array<{ operator: string; value: string }> };
  unsupported?: boolean;
};
type FilterCell = { text: string; raw?: string; date?: string };
const elements = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*", name));

export function parseSavedFilters(document: Document): SavedExcelFilter[] {
  const auto = elements(document, "autoFilter")[0];
  const range = sheetFilterRange(auto?.getAttribute("ref") || null);
  if (!auto || !range) return [];
  return elements(auto, "filterColumn").flatMap<SavedExcelFilter>((column) => {
    const offset = Number(column.getAttribute("colId"));
    if (!column.hasAttribute("colId") || !Number.isInteger(offset) || offset < 0 || offset > range.lastColumn - range.firstColumn) return [];
    const base = { column: range.firstColumn + offset };
    if (!Array.from(column.childNodes).some((node) => node.nodeType === 1)) return [];
    const values = elements(column, "filters")[0];
    if (values) {
      const dates = elements(values, "dateGroupItem").map((date) => {
        const fields: Record<string, number> = {};
        for (const key of ["year", "month", "day", "hour", "minute", "second"]) {
          if (date.hasAttribute(key)) fields[key] = Number(date.getAttribute(key));
        }
        return fields;
      });
      return [{ ...base, values: elements(values, "filter").map((item) => item.getAttribute("val") || ""), blank: ["1", "true"].includes(values.getAttribute("blank") || ""), dates }];
    }
    const custom = elements(column, "customFilters")[0];
    if (custom) {
      const rules = elements(custom, "customFilter").map((rule) => ({ operator: rule.getAttribute("operator") || "equal", value: rule.getAttribute("val") || "" }));
      const supported = rules.length > 0 && rules.length <= 2 && rules.every((rule) => ["equal", "notEqual", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual"].includes(rule.operator));
      return [{ ...base, custom: { and: ["1", "true"].includes(custom.getAttribute("and") || ""), rules }, unsupported: !supported }];
    }
    // Unsupported Excel filter types keep the saved hidden-row mask.
    return [{ ...base, unsupported: true }];
  });
}

export function worksheetSavedFilters(parts: Record<string, Uint8Array>, name: string): SavedExcelFilter[] {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const xml = (path: string) => parts[path] ? parser.parseFromString(strFromU8(parts[path]), "application/xml") : null;
  const relationship = (source: string, id: string | null): string | undefined => {
    const at = source.lastIndexOf("/");
    const links = xml(source.slice(0, at + 1) + "_rels/" + source.slice(at + 1) + ".rels");
    const link = links && elements(links, "Relationship").find((item) => item.getAttribute("Id") === id && item.getAttribute("TargetMode") !== "External");
    if (!link) return undefined;
    try {
      const target = new URL(link.getAttribute("Target") || "", "https://workbook.invalid/" + source);
      return target.origin === "https://workbook.invalid" ? target.pathname.slice(1) : undefined;
    } catch {
      return undefined;
    }
  };
  const workbook = xml("xl/workbook.xml");
  const entry = workbook && elements(workbook, "sheet").find((sheet) => sheet.getAttribute("name") === name);
  const path = entry && relationship("xl/workbook.xml", entry.getAttribute("r:id"));
  const sheet = path && xml(path);
  if (!sheet) return [];
  if (elements(sheet, "autoFilter").length) return parseSavedFilters(sheet);
  for (const table of elements(sheet, "tablePart").slice(0, 1)) {
    const tablePath = relationship(path, table.getAttribute("r:id"));
    const document = tablePath && xml(tablePath);
    if (document) { const filters = parseSavedFilters(document); if (filters.length) return filters; }
  }
  return [];
}

function wildcard(text: string, pattern: string): boolean {
  if (pattern.length > 256 || text.length > 4096) return text.toLowerCase() === pattern.toLowerCase();
  const tokens: Array<{ type: "literal" | "any" | "star"; value: string }> = [];
  const chars = Array.from(pattern.toLowerCase());
  for (let index = 0; index < chars.length; index++) {
    const value = chars[index];
    if (value === "~" && index + 1 < chars.length) tokens.push({ type: "literal", value: chars[++index] });
    else tokens.push({ type: value === "*" ? "star" : value === "?" ? "any" : "literal", value });
  }
  const source = Array.from(text.toLowerCase());
  let i = 0, j = 0, star = -1, retry = 0;
  while (i < source.length) {
    if (tokens[j]?.type === "any" || tokens[j]?.type === "literal" && tokens[j].value === source[i]) { i++; j++; }
    else if (tokens[j]?.type === "star") { star = j++; retry = i; }
    else if (star >= 0) { j = star + 1; i = ++retry; }
    else return false;
  }
  while (tokens[j]?.type === "star") j++;
  return j === tokens.length;
}

export function matchesSavedExcelFilter(cell: FilterCell | undefined, filter: SavedExcelFilter): boolean {
  if (filter.unsupported) return true;
  const raw = cell?.raw ?? cell?.text ?? "";
  if (filter.custom) {
    const results = filter.custom.rules.map((rule) => {
      const numeric = raw.trim() !== "" && rule.value.trim() !== "" && Number.isFinite(Number(raw)) && Number.isFinite(Number(rule.value));
      if (rule.operator === "equal") return numeric ? Number(raw) === Number(rule.value) : wildcard(raw, rule.value);
      if (rule.operator === "notEqual") return numeric ? Number(raw) !== Number(rule.value) : !wildcard(raw, rule.value);
      const comparison = numeric ? Number(raw) - Number(rule.value) : raw.toLowerCase().localeCompare(rule.value.toLowerCase());
      return rule.operator === "lessThan" ? comparison < 0 : rule.operator === "lessThanOrEqual" ? comparison <= 0 : rule.operator === "greaterThan" ? comparison > 0 : comparison >= 0;
    });
    return filter.custom.and ? results.every(Boolean) : results.some(Boolean);
  }
  if (filter.blank && raw === "") return true;
  if (filter.values?.some((value) => value.toLowerCase() === raw.toLowerCase())) return true;
  if (cell?.date && filter.dates?.length) {
    const date = new Date(cell.date);
    const fields: Record<string, number> = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
    return filter.dates.some((group) => Object.keys(group).length > 0 && Object.entries(group).every(([key, value]) => fields[key] === value));
  }
  return false;
}
