import { PDFDocument } from "pdf-lib";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { applyPermanentWatermark } from "./watermark.service";

describe("permanent document watermark", () => {
  it.each(["HEADER", "CENTER", "FOOTER"] as const)(
    "embeds the text on every PDF page at %s",
    async (position) => {
      const source = await PDFDocument.create();
      source.addPage([595, 842]);
      source.addPage([595, 842]);
      const result = await applyPermanentWatermark(
        Buffer.from(await source.save()),
        "application/pdf",
        position,
      );
      const parsed = await PDFDocument.load(result);
      expect(parsed.getPageCount()).toBe(2);
      expect(result.equals(Buffer.from(await source.save()))).toBe(false);
    },
  );

  it("embeds a printable VML watermark in DOCX content", async () => {
    const source = Buffer.from(
      zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "word/document.xml": strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
        ),
      }),
    );
    const result = await applyPermanentWatermark(
      source,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "CENTER",
    );
    const xml = strFromU8(unzipSync(result)["word/document.xml"]);
    expect(xml).toContain("SENSITIVE DOCUMENT");
    expect(xml).toContain("mso-position-vertical:center");
    expect(xml).toContain("urn:schemas-microsoft-com:vml");
  });

  it.each([
    ["HEADER", "oddHeader"],
    ["CENTER", "oddHeader"],
    ["FOOTER", "oddFooter"],
  ] as const)("embeds a printable XLSX %s marker", async (position, tag) => {
    const source = Buffer.from(
      zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "xl/worksheets/sheet1.xml": strToU8(
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
        ),
      }),
    );
    const result = await applyPermanentWatermark(
      source,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      position,
    );
    const xml = strFromU8(unzipSync(result)["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain(`<${tag}>`);
    expect(xml).toContain("SENSITIVE DOCUMENT");
  });
});
