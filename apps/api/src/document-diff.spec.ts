import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  compareDocumentVersions,
  extractDocumentParagraphs,
} from "./document-diff";

const docx = (...paragraphs: string[]) =>
  Buffer.from(
    zipSync({
      "word/document.xml": strToU8(
        `<w:document>${paragraphs.map((value) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`).join("")}</w:document>`,
      ),
    }),
  );

describe("document version comparison", () => {
  it("extracts DOCX paragraphs and reports visible changes", () => {
    const before = docx("Stable policy", "Old requirement");
    const after = docx("Stable policy", "New requirement", "Added evidence");
    expect(extractDocumentParagraphs(after, ".docx")).toContain(
      "Added evidence",
    );
    const result = compareDocumentVersions(before, after, ".docx");
    expect(result.details.modified).toEqual([
      { before: "Old requirement", after: "New requirement" },
    ]);
    expect(result.details.added).toEqual(["Added evidence"]);
  });

  it("extracts text operators from a PDF content stream", () => {
    const before = Buffer.from("%PDF-1.4\nstream\n(Old control) Tj\nendstream");
    const after = Buffer.from("%PDF-1.4\nstream\n(New control) Tj\nendstream");
    expect(
      compareDocumentVersions(before, after, ".pdf").details.modified,
    ).toEqual([{ before: "Old control", after: "New control" }]);
  });
});
