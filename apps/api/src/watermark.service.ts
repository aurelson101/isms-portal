import { ConflictException, Injectable } from "@nestjs/common";
import type { WatermarkPosition } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { extname } from "path";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { AntivirusService } from "./antivirus.service";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";

const TEXT = "SENSITIVE DOCUMENT";

const replaceZipEntry = (
  content: Buffer,
  predicate: (name: string) => boolean,
  transform: (xml: string, name: string) => string,
) => {
  const archive = unzipSync(content);
  for (const [name, bytes] of Object.entries(archive)) {
    if (predicate(name))
      archive[name] = strToU8(transform(strFromU8(bytes), name));
  }
  return Buffer.from(zipSync(archive, { level: 6 }));
};

const wordWatermark = (position: WatermarkPosition) => {
  const vertical =
    position === "HEADER" ? "top" : position === "FOOTER" ? "bottom" : "center";
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:pict><v:shape id="ISMS-Sensitive-Watermark" type="#_x0000_t136" style="position:absolute;width:440pt;height:80pt;z-index:-251654144;mso-position-horizontal:center;mso-position-horizontal-relative:page;mso-position-vertical:${vertical};mso-position-vertical-relative:page;rotation:315" fillcolor="#D65A5A" stroked="f"><v:fill opacity="0.18"/><v:textpath style="font-family:Arial;font-size:34pt;font-weight:bold" string="${TEXT}"/></v:shape></w:pict></w:r></w:p>`;
};

const watermarkDocx = (content: Buffer, position: WatermarkPosition) =>
  replaceZipEntry(
    content,
    (name) => name === "word/document.xml",
    (xml) => {
      let updated = xml;
      if (!/xmlns:v=/.test(updated))
        updated = updated.replace(
          /<w:document\b/,
          '<w:document xmlns:v="urn:schemas-microsoft-com:vml"',
        );
      const marker = wordWatermark(position);
      return position === "FOOTER"
        ? updated.replace(/<\/w:body>/, `${marker}</w:body>`)
        : updated.replace(/<w:body>/, `<w:body>${marker}`);
    },
  );

const watermarkXlsx = (content: Buffer, position: WatermarkPosition) =>
  replaceZipEntry(
    content,
    (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
    (xml) => {
      const tag = position === "FOOTER" ? "oddFooter" : "oddHeader";
      const prefix =
        position === "CENTER"
          ? "&amp;C&amp;24&amp;KCC7777"
          : "&amp;C&amp;14&amp;KCC7777";
      const block = `<headerFooter><${tag}>${prefix}${TEXT}</${tag}></headerFooter>`;
      if (/<headerFooter[\s>]/.test(xml))
        return xml.replace(/<headerFooter[\s\S]*?<\/headerFooter>/, block);
      return xml.replace(/<\/worksheet>/, `${block}</worksheet>`);
    },
  );

const watermarkPdf = async (content: Buffer, position: WatermarkPosition) => {
  const document = await PDFDocument.load(content, { updateMetadata: false });
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const fontSize =
      position === "CENTER" ? Math.max(24, Math.min(52, width / 11)) : 14;
    const textWidth = font.widthOfTextAtSize(TEXT, fontSize);
    const x = Math.max(18, (width - textWidth) / 2);
    const y =
      position === "HEADER"
        ? height - 32
        : position === "FOOTER"
          ? 18
          : height / 2;
    page.drawText(TEXT, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.78, 0.18, 0.18),
      opacity: 0.2,
      rotate: position === "CENTER" ? degrees(32) : degrees(0),
    });
  }
  return Buffer.from(await document.save());
};

export const applyPermanentWatermark = async (
  content: Buffer,
  mimeType: string,
  position: WatermarkPosition,
) => {
  if (mimeType === "application/pdf") return watermarkPdf(content, position);
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return watermarkDocx(content, position);
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return watermarkXlsx(content, position);
  throw new ConflictException(
    "Permanent watermarking is unsupported for this file type",
  );
};

@Injectable()
export class WatermarkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
  ) {}

  async prepareForPublication(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { include: { storedFile: true } } },
    });
    if (!document?.sensitive) return [];
    const generated: Array<{
      locale: string;
      version: number;
      sha256: string;
    }> = [];
    for (const version of document.versions) {
      if (version.distributedStoredFileId) continue;
      const source = await this.storage.getBuffer(version.storedFile.objectKey);
      const watermarked = await applyPermanentWatermark(
        source,
        version.storedFile.mimeType,
        document.watermarkPosition,
      );
      const scan = await this.antivirus.scan(watermarked);
      if (scan.status !== "CLEAN")
        throw new ConflictException(
          "Watermarked distribution file failed antivirus scanning",
        );
      const sha256 = createHash("sha256").update(watermarked).digest("hex");
      const extension = extname(version.storedFile.originalName).toLowerCase();
      const objectKey = `documents/${document.id}/${version.locale}/distributed/${randomUUID()}${extension}`;
      await this.storage.putObject(objectKey, watermarked, {
        "Content-Type": version.storedFile.mimeType,
        "X-Amz-Meta-Sha256": sha256,
      });
      try {
        const distributed = await this.prisma.storedFile.create({
          data: {
            objectKey,
            originalName: version.storedFile.originalName,
            mimeType: version.storedFile.mimeType,
            size: BigInt(watermarked.length),
            sha256,
            scans: { create: { status: "CLEAN", scannedAt: new Date() } },
          },
        });
        await this.prisma.documentVersion.update({
          where: { id: version.id },
          data: { distributedStoredFileId: distributed.id },
        });
      } catch (error) {
        await this.storage.removeObject(objectKey).catch(() => undefined);
        throw error;
      }
      generated.push({
        locale: version.locale,
        version: version.version,
        sha256,
      });
    }
    return generated;
  }
}
