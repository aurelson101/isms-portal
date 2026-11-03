import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { extname } from "node:path";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";
import { AuditService } from "./audit.service";
import { AdminOnly } from "./security";
import { verifyAuditChain } from "./audit-chain";
import { timestampAuthorityUrl } from "./timestamp";
import type { IsmsRequest } from "./types";

const EXPORT_MAX_DOCUMENTS = 1000;
const EXPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

class DocumentTypeDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/u) slug!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameFr!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameEn!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Za-z0-9_.-]{1,64}$/u, { each: true })
  requiredFields!: string[];
  @IsOptional() @Matches(/^[A-Z0-9][A-Z0-9-]{0,19}$/u) referencePrefix?:
    | string
    | null;
}

const safeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w.-]+/gu, "_")
    .replace(/_+/gu, "_")
    .slice(0, 80) || "document";

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""')}"`;
};

/** Lists active document types (any authenticated user, for metadata forms). */
@Controller("document-types")
export class DocumentTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.documentType.findMany({
      where: { deletedAt: null },
      orderBy: { nameFr: "asc" },
    });
  }
}

@Controller("admin/ged")
@AdminOnly()
export class GedAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post("document-types")
  async createType(@Req() req: IsmsRequest, @Body() body: DocumentTypeDto) {
    if (
      await this.prisma.documentType.findUnique({ where: { slug: body.slug } })
    )
      throw new ConflictException("This document type already exists");
    const type = await this.prisma.documentType.create({
      data: {
        slug: body.slug,
        nameFr: body.nameFr.trim(),
        nameEn: body.nameEn.trim(),
        requiredFields: [...new Set(body.requiredFields)],
        referencePrefix: body.referencePrefix || null,
      },
    });
    await this.audit.record(
      req,
      "document-type.create",
      `document-type:${type.id}`,
      "success",
      body,
      { notify: false },
    );
    return type;
  }

  @Put("document-types/:id")
  async updateType(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: DocumentTypeDto,
  ) {
    const existing = await this.prisma.documentType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException();
    if (existing.slug !== body.slug)
      throw new BadRequestException(
        "The identifier is stored in documents and cannot change",
      );
    const type = await this.prisma.documentType.update({
      where: { id },
      data: {
        nameFr: body.nameFr.trim(),
        nameEn: body.nameEn.trim(),
        requiredFields: [...new Set(body.requiredFields)],
        referencePrefix: body.referencePrefix || null,
      },
    });
    await this.audit.record(
      req,
      "document-type.update",
      `document-type:${id}`,
      "success",
      body,
      { notify: false },
    );
    return type;
  }

  @Delete("document-types/:id")
  async deleteType(@Req() req: IsmsRequest, @Param("id") id: string) {
    const removed = await this.prisma.documentType.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (removed.count !== 1) throw new NotFoundException();
    await this.audit.record(
      req,
      "document-type.delete",
      `document-type:${id}`,
      "success",
      undefined,
      { notify: false },
    );
    return { deleted: true };
  }

  /** Streams a ZIP of the latest clean version of each document + manifests. */
  @Get("export")
  async export(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Query("spaceId") spaceId?: string,
    @Query("categoryId") categoryId?: string,
    @Query("status") status?: string,
  ) {
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(spaceId ? { spaceId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)
        ? { status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" }
        : { status: { not: "QUARANTINED" as const } }),
    };
    const documents = await this.prisma.document.findMany({
      where,
      include: {
        space: { select: { slug: true, nameFr: true } },
        category: { select: { slug: true, nameFr: true } },
        translations: true,
        versions: {
          orderBy: { version: "desc" },
          include: {
            storedFile: {
              include: {
                scans: { orderBy: { scannedAt: "desc" }, take: 1 },
                timestamp: { select: { genTime: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: EXPORT_MAX_DOCUMENTS + 1,
    });
    if (documents.length > EXPORT_MAX_DOCUMENTS)
      throw new BadRequestException(
        `Export limited to ${EXPORT_MAX_DOCUMENTS} documents; filter by space or category`,
      );
    const entries = documents.flatMap((document) => {
      const latest = new Map<string, (typeof document.versions)[number]>();
      for (const version of document.versions)
        if (!latest.has(version.locale)) latest.set(version.locale, version);
      return [...latest.values()]
        .filter(
          (version) =>
            version.storedFile.scans[0]?.status === "CLEAN" &&
            !version.storedFile.purgedAt,
        )
        .map((version) => {
          const title =
            document.translations.find((item) => item.locale === version.locale)
              ?.title || document.slug;
          const path = [
            safeName(document.space.slug),
            ...(document.category ? [safeName(document.category.slug)] : []),
            `${safeName(document.slug)}`,
            `${version.locale}-v${version.version}-${safeName(title)}${extname(version.storedFile.originalName).toLowerCase()}`,
          ].join("/");
          return { document, version, title, path };
        });
    });
    const totalBytes = entries.reduce(
      (sum, entry) => sum + Number(entry.version.storedFile.size),
      0,
    );
    if (totalBytes > EXPORT_MAX_BYTES)
      throw new BadRequestException(
        "Export larger than 2 GB; filter by space or category",
      );
    const event = await this.audit.record(
      req,
      "documents.export",
      `documents:export`,
      "success",
      {
        spaceId,
        categoryId,
        status,
        documents: documents.length,
        files: entries.length,
        totalBytes,
      },
      { notify: false },
    );
    response.setHeader("Content-Type", "application/zip");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="isms-export-${new Date().toISOString().slice(0, 10)}.zip"`,
    );
    response.setHeader("Cache-Control", "no-store");
    let failed = false;
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        failed = true;
        response.destroy(error);
        return;
      }
      response.write(Buffer.from(chunk));
      if (final) response.end();
    });
    const drain = () =>
      response.writableNeedDrain
        ? new Promise<void>((resolve) =>
            response.once("drain", () => resolve()),
          )
        : Promise.resolve();
    const manifest = [];
    for (const entry of entries) {
      if (failed || response.destroyed) return;
      let content: Buffer;
      try {
        content = await this.storage.getBuffer(
          entry.version.storedFile.objectKey,
        );
      } catch (error) {
        // Headers are already sent: abort the download instead of a partial ZIP.
        response.destroy(error as Error);
        return;
      }
      const file = new ZipPassThrough(entry.path);
      zip.add(file);
      file.push(content, true);
      await drain();
      const metadata = (entry.document.metadata || {}) as Record<
        string,
        string
      >;
      manifest.push({
        documentId: entry.document.id,
        slug: entry.document.slug,
        reference: metadata["ged.reference"] || "",
        title: entry.title,
        locale: entry.version.locale,
        version: entry.version.version,
        status: entry.document.status,
        space: entry.document.space.nameFr,
        category: entry.document.category?.nameFr || "",
        documentType: metadata["ged.documentType"] || "",
        owner: metadata["ged.owner"] || "",
        publishedAt: entry.document.publishedAt?.toISOString() || "",
        file: entry.path,
        originalName: entry.version.storedFile.originalName,
        sha256: entry.version.storedFile.sha256,
        size: Number(entry.version.storedFile.size),
        timestampedAt:
          entry.version.storedFile.timestamp?.genTime?.toISOString() || "",
        metadata,
      });
    }
    const columns = [
      "documentId",
      "slug",
      "reference",
      "title",
      "locale",
      "version",
      "status",
      "space",
      "category",
      "documentType",
      "owner",
      "publishedAt",
      "file",
      "originalName",
      "sha256",
      "size",
      "timestampedAt",
    ] as const;
    const csv = [
      columns.join(";"),
      ...manifest.map((row) =>
        columns.map((column) => csvCell(row[column])).join(";"),
      ),
    ].join("\r\n");
    for (const [name, content] of [
      // UTF-8 byte order mark so spreadsheet tools read accents correctly.
      ["manifest.csv", `${String.fromCharCode(0xfeff)}${csv}`],
      [
        "manifest.json",
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            auditEventId: event.id,
            files: manifest,
          },
          null,
          2,
        ),
      ],
    ] as const) {
      const file = new ZipPassThrough(name);
      zip.add(file);
      file.push(strToU8(content), true);
    }
    zip.end();
  }

  @Get("audit/integrity")
  integrity() {
    return verifyAuditChain(this.prisma);
  }

  @Get("audit/seals")
  async seals() {
    const seals = await this.prisma.auditSeal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        lastChainIndex: true,
        chainHash: true,
        eventCount: true,
        genTime: true,
        tsaUrl: true,
        createdAt: true,
      },
    });
    return {
      timestampAuthorityConfigured: Boolean(timestampAuthorityUrl()),
      seals: seals.map((seal) => ({
        ...seal,
        lastChainIndex: seal.lastChainIndex.toString(),
        timestamped: Boolean(seal.genTime),
      })),
    };
  }

  /** RFC 3161 token (.tsr) of an audit seal, verifiable with `openssl ts -verify`. */
  @Get("audit/seals/:id/token")
  async sealToken(@Res() response: Response, @Param("id") id: string) {
    const seal = await this.prisma.auditSeal.findUnique({ where: { id } });
    if (!seal?.token) throw new NotFoundException();
    response
      .type("application/timestamp-reply")
      .attachment(`audit-seal-${seal.lastChainIndex}.tsr`)
      .send(Buffer.from(seal.token));
  }

  /** RFC 3161 token of a stored file (document version). */
  @Get("versions/:versionId/timestamp")
  async versionToken(
    @Res() response: Response,
    @Param("versionId") versionId: string,
  ) {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: { storedFile: { include: { timestamp: true } } },
    });
    const token = version?.storedFile.timestamp;
    if (!token) throw new NotFoundException();
    response
      .type("application/timestamp-reply")
      .attachment(`${version.storedFile.sha256}.tsr`)
      .send(Buffer.from(token.token));
  }
}
