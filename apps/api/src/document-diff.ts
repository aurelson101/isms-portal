import { unzipSync } from "fflate";

type DocumentChangeDetails = {
  added: string[];
  removed: string[];
  modified: Array<{ before: string; after: string }>;
};

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const normalize = (values: string[]) =>
  [
    ...new Set(
      values
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length >= 2),
    ),
  ].slice(0, 500);

const xmlText = (xml: string, paragraphTag: string) =>
  normalize(
    xml
      .replace(new RegExp(`</${paragraphTag}>`, "g"), "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map(decodeXml),
  );

const officeText = (buffer: Buffer, extension: string) => {
  const archive = unzipSync(new Uint8Array(buffer));
  if (extension === ".docx") {
    const document = archive["word/document.xml"];
    return document
      ? xmlText(Buffer.from(document).toString("utf8"), "w:p")
      : [];
  }
  const shared = archive["xl/sharedStrings.xml"];
  const sheets = Object.entries(archive)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))
    .flatMap(([, content]) =>
      xmlText(Buffer.from(content).toString("utf8"), "row"),
    );
  return normalize([
    ...(shared ? xmlText(Buffer.from(shared).toString("utf8"), "si") : []),
    ...sheets,
  ]);
};

const PDF_MAX_PAGES = 300;
const PDF_TIME_BUDGET_MS = 20_000;

// pdfjs decodes fonts (ToUnicode, CID, kerning) and yields between pages, so
// large files cannot pin the event loop and text comes out as readable lines.
const pdfText = async (buffer: Buffer) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const deadline = Date.now() + PDF_TIME_BUDGET_MS;
  const lines: string[] = [];
  try {
    const document = await task.promise;
    const pages = Math.min(document.numPages, PDF_MAX_PAGES);
    for (let number = 1; number <= pages && Date.now() < deadline; number++) {
      const page = await document.getPage(number);
      let line = "";
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return normalize(lines);
};

export const extractDocumentParagraphs = async (
  buffer: Buffer,
  extension: string,
): Promise<string[]> => {
  try {
    if ([".docx", ".xlsx"].includes(extension))
      return officeText(buffer, extension);
    if (extension === ".pdf") return await pdfText(buffer);
  } catch {
    return [];
  }
  return [];
};

// Ordered diff (LCS): a line is "modified" only when a removal and an addition
// happen at the same place; lines that merely moved are not reported.
const diffLines = (before: string[], after: string[]) => {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const common = before.map(() => new Uint16Array(after.length + 1));
  common.push(new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      common[i][j] =
        before[i] === after[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
  const result: DocumentChangeDetails = {
    added: [],
    removed: [],
    modified: [],
  };
  let removedRun: string[] = [];
  let addedRun: string[] = [];
  const flush = () => {
    const removed = removedRun.filter((line) => !afterSet.has(line));
    const added = addedRun.filter((line) => !beforeSet.has(line));
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++)
      result.modified.push({ before: removed[k], after: added[k] });
    result.removed.push(...removed.slice(pairs));
    result.added.push(...added.slice(pairs));
    removedRun = [];
    addedRun = [];
  };
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      flush();
      i++;
      j++;
    } else if (
      j < after.length &&
      (i === before.length || common[i][j + 1] >= common[i + 1][j])
    )
      addedRun.push(after[j++]);
    else removedRun.push(before[i++]);
  }
  flush();
  return result;
};

export const compareDocumentVersions = async (
  previous: Buffer,
  current: Buffer,
  extension: string,
) => {
  const before = await extractDocumentParagraphs(previous, extension);
  const after = await extractDocumentParagraphs(current, extension);
  const changes = diffLines(before, after);
  const details: DocumentChangeDetails = {
    added: changes.added.slice(0, 100),
    removed: changes.removed.slice(0, 100),
    modified: changes.modified.slice(0, 100),
  };
  return {
    details,
    summary: `${details.added.length} added, ${details.removed.length} removed, ${details.modified.length} modified`,
  };
};
