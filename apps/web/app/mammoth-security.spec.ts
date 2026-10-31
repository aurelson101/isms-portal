import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import mammoth from "mammoth";

describe("Mammoth argument parser security override", () => {
  it("uses the dependency-free compatible parser instead of sprintf-js", () => {
    const requireMammoth = createRequire(import.meta.resolve("mammoth"));
    const parser = requireMammoth("argparse/package.json");
    expect(parser.version).toBe("2.0.1");
    expect(parser.dependencies || {}).not.toHaveProperty("sprintf-js");
  });

  it("preserves the Mammoth command-line interface", () => {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.resolve("mammoth/bin/mammoth")), "--help"],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    expect(output).toContain("--output-format");
    expect(output).toContain("--style-map");
    expect(output).toContain("docx-path");
  });

  it("preserves DOCX conversion and escapes text in the HTML preview", async () => {
    const archive = zipSync({
      "[Content_Types].xml": strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Policy &amp; &lt;script&gt;</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    const result = await mammoth.convertToHtml({
      buffer: Buffer.from(archive),
    });
    expect(result.value).toBe("<p>Policy &amp; &lt;script&gt;</p>");
    const directory = mkdtempSync(join(tmpdir(), "isms-mammoth-test-"));
    try {
      const input = join(directory, "security policy.docx");
      writeFileSync(input, archive);
      const output = execFileSync(
        process.execPath,
        [
          fileURLToPath(import.meta.resolve("mammoth/bin/mammoth")),
          input,
          "--output-format",
          "html",
        ],
        {
          encoding: "utf8",
          timeout: 5000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      expect(output.trim()).toBe(result.value);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
