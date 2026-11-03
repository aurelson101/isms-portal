import { zipSync, strToU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
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

// Minimal one-page PDF; like ReportLab, no end-of-line precedes "endstream".
const pdf = (content: string) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const lines = (...values: string[]) =>
  `BT /F1 12 Tf ${values.map((value, index) => `1 0 0 1 50 ${700 - index * 20} Tm ${value}`).join(" ")} ET`;

describe("document version comparison", () => {
  // The first PDF parse loads pdfjs and its worker; keep it out of test timeouts.
  beforeAll(() => extractDocumentParagraphs(pdf("BT ET"), ".pdf"), 30_000);

  it("extracts DOCX paragraphs and reports visible changes", async () => {
    const before = docx("Stable policy", "Old requirement");
    const after = docx("Stable policy", "New requirement", "Added evidence");
    expect(await extractDocumentParagraphs(after, ".docx")).toContain(
      "Added evidence",
    );
    const result = await compareDocumentVersions(before, after, ".docx");
    expect(result.details.modified).toEqual([
      { before: "Old requirement", after: "New requirement" },
    ]);
    expect(result.details.added).toEqual(["Added evidence"]);
  });

  it("pairs changes where they happen and ignores moved lines", async () => {
    const before = docx("Intro", "Old step", "Middle", "Removed note", "Tail");
    const after = docx("Tail", "Intro", "New step", "Middle", "Added note");
    const result = await compareDocumentVersions(before, after, ".docx");
    expect(result.details).toEqual({
      modified: [
        { before: "Old step", after: "New step" },
        { before: "Removed note", after: "Added note" },
      ],
      added: [],
      removed: [],
    });
  });

  it("compares PDF text line by line", async () => {
    const before = pdf(lines("(Stable control) Tj", "(Old control) Tj"));
    const after = pdf(lines("(Stable control) Tj", "(New control) Tj"));
    const result = await compareDocumentVersions(before, after, ".pdf");
    expect(result.details.modified).toEqual([
      { before: "Old control", after: "New control" },
    ]);
    expect(result.details.added).toEqual([]);
    expect(result.details.removed).toEqual([]);
  });

  it("joins kerned TJ fragments into whole lines", async () => {
    const document = pdf(
      lines(
        "[(Pass) -20 (bolt Us) 15 (er Gui) (de)] TJ",
        "(Hello \\(world\\)) Tj",
      ),
    );
    expect(await extractDocumentParagraphs(document, ".pdf")).toEqual([
      "Passbolt User Guide",
      "Hello (world)",
    ]);
  });

  it("returns no text for an unreadable PDF instead of failing", async () => {
    const binary = Buffer.from(
      `%PDF-1.4\n(${"\\a".repeat(20_000)}${"[(x".repeat(20_000)}`,
      "latin1",
    );
    expect(await extractDocumentParagraphs(binary, ".pdf")).toEqual([]);
  });
});
