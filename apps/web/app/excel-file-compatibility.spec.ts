import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import ExcelJS from "exceljs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { readExcelBook, type ExcelBook } from "./excel-reader-model";
import { matchesSavedExcelFilter } from "./excel-saved-filters";

// Opt-in local fixture: never store private workbooks in the repository.
const path = process.env.ISMS_EXCEL_TEST_FILE;
describe.skipIf(!path)("external XLSX compatibility", () => {
  let bytes: Buffer;
  let originalHash: string;
  let workbook: ExcelJS.Workbook;
  let model: ExcelBook;
  beforeAll(async () => {
    vi.stubGlobal("DOMParser", DOMParser);
    bytes = readFileSync(path!);
    originalHash = createHash("sha256").update(bytes).digest("hex");
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    model = await readExcelBook(bytes as unknown as ArrayBuffer, "fr");
  });
  afterAll(() => {
    if (bytes)
      expect(
        createHash("sha256").update(readFileSync(path!)).digest("hex"),
      ).toBe(originalHash);
    vi.unstubAllGlobals();
  });
  it("preserves visible worksheets, merges, raster assets and formatted dates", () => {
    expect(model.sheets.map((sheet) => sheet.id)).toEqual(
      workbook.worksheets
        .filter((sheet) => sheet.state === "visible")
        .map((sheet) => sheet.id),
    );
    for (const sheet of model.sheets) {
      const source = workbook.getWorksheet(sheet.id)!;
      expect(sheet.merges.length).toBe(source.model.merges.length);
      expect(sheet.images.length).toBe(
        source
          .getImages()
          .filter((image) =>
            /^(png|jpe?g)$/.test(
              String(workbook.getImage(Number(image.imageId)).extension),
            ),
          ).length,
      );
      for (const row of sheet.rows)
        for (const column of sheet.columns) {
          const value = source.getCell(row.number, column.index + 1).value;
          if (
            value instanceof Date &&
            source.getCell(row.number, column.index + 1).numFmt === "mm-dd-yy"
          ) {
            const expected = new Intl.DateTimeFormat("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              timeZone: "UTC",
            }).format(value);
            expect(row.cells[column.index].text === expected).toBe(true);
          }
        }
    }
  });
  it("matches every distinct source value for each visible filter column", () => {
    let cases = 0;
    for (const sheet of model.sheets.filter((entry) => entry.filter)) {
      const source = workbook.getWorksheet(sheet.id)!;
      const range = sheet.filter!;
      const rows = sheet.rows.filter(
        (row) => row.number > range.headerRow && row.number <= range.lastRow,
      );
      for (const column of sheet.columns.filter(
        (column) =>
          column.index >= range.firstColumn && column.index <= range.lastColumn,
      )) {
        const values = [
          ...new Set(
            rows.map(
              (row) => source.getCell(row.number, column.index + 1).text,
            ),
          ),
        ];
        for (const value of values) {
          const expected = rows
            .filter(
              (row) =>
                source
                  .getCell(row.number, column.index + 1)
                  .text.toLowerCase() === value.toLowerCase(),
            )
            .map((row) => row.number);
          const filter = {
            column: column.index,
            values: [value],
            blank: value === "",
          };
          const actual = rows
            .filter((row) =>
              matchesSavedExcelFilter(row.cells[column.index], filter),
            )
            .map((row) => row.number);
          expect(actual).toEqual(expected);
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThan(0);
  });
  it("restores single and multiple saved values using the original table part", async () => {
    const target = model.sheets.find((sheet) => sheet.filter)!;
    const column = target.columns.find(
      (column) =>
        column.index >= target.filter!.firstColumn &&
        column.index <= target.filter!.lastColumn,
    )!;
    const rows = target.rows.filter(
      (row) =>
        row.number > target.filter!.headerRow &&
        row.number <= target.filter!.lastRow,
    );
    const values = [
      ...new Set(rows.map((row) => row.cells[column.index].raw || "")),
    ]
      .filter(Boolean)
      .slice(0, 2);
    for (let count = 1; count <= values.length; count++) {
      const parts = unzipSync(bytes);
      const tablePath = Object.keys(parts).find((name) =>
        /^xl\/tables\/table\d+\.xml$/.test(name),
      )!;
      const document = new DOMParser().parseFromString(
        strFromU8(parts[tablePath]),
        "application/xml",
      );
      const auto = document.getElementsByTagName("autoFilter")[0];
      while (auto.firstChild) auto.removeChild(auto.firstChild);
      const filterColumn = document.createElementNS(
        auto.namespaceURI,
        "filterColumn",
      );
      filterColumn.setAttribute(
        "colId",
        String(column.index - target.filter!.firstColumn),
      );
      const filters = document.createElementNS(auto.namespaceURI, "filters");
      for (const value of values.slice(0, count)) {
        const filter = document.createElementNS(auto.namespaceURI, "filter");
        filter.setAttribute("val", value);
        filters.appendChild(filter);
      }
      filterColumn.appendChild(filters);
      auto.appendChild(filterColumn);
      parts[tablePath] = strToU8(
        new XMLSerializer().serializeToString(document),
      );
      const variant = await readExcelBook(
        zipSync(parts).buffer as ArrayBuffer,
        "fr",
      );
      const result = variant.sheets.find((sheet) => sheet.id === target.id)!;
      expect(result.savedFilters[0].values).toEqual(values.slice(0, count));
      expect(
        rows
          .filter((row) =>
            matchesSavedExcelFilter(
              row.cells[column.index],
              result.savedFilters[0],
            ),
          )
          .map((row) => row.number),
      ).toEqual(
        rows
          .filter((row) =>
            values.slice(0, count).includes(row.cells[column.index].raw || ""),
          )
          .map((row) => row.number),
      );
    }
  });
});
