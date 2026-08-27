import { unzipSync } from "fflate";
import { inflateSync } from "zlib";

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

const pdfString = (value: string) =>
  value
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n|\\r/g, " ")
    .replace(/\\[0-7]{1,3}/g, " ");

const pdfText = (buffer: Buffer) => {
  const source = buffer.toString("latin1");
  const streams: string[] = [source];
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams.push(
        inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"),
      );
    } catch {
      streams.push(match[1]);
    }
  }
  return normalize(
    streams.flatMap((stream) =>
      [
        ...stream.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj|\[(.*?)\]\s*TJ/gs),
      ].flatMap((match) => {
        if (match[1]) return [pdfString(match[1])];
        return [
          ...(match[2] || "").matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g),
        ].map((part) => pdfString(part[1]));
      }),
    ),
  );
};

export const extractDocumentParagraphs = (
  buffer: Buffer,
  extension: string,
) => {
  try {
    if ([".docx", ".xlsx"].includes(extension))
      return officeText(buffer, extension);
    if (extension === ".pdf") return pdfText(buffer);
  } catch {
    return [];
  }
  return [];
};

export const compareDocumentVersions = (
  previous: Buffer,
  current: Buffer,
  extension: string,
) => {
  const before = extractDocumentParagraphs(previous, extension);
  const after = extractDocumentParagraphs(current, extension);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const removed = before.filter((item) => !afterSet.has(item));
  const added = after.filter((item) => !beforeSet.has(item));
  const modified = removed
    .slice(0, Math.min(removed.length, added.length))
    .map((value, index) => ({ before: value, after: added[index] }));
  const details: DocumentChangeDetails = {
    added: added.slice(modified.length, 100),
    removed: removed.slice(modified.length, 100),
    modified: modified.slice(0, 100),
  };
  return {
    details,
    summary: `${details.added.length} added, ${details.removed.length} removed, ${details.modified.length} modified`,
  };
};
