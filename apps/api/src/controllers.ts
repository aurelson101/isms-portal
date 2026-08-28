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
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash, createHmac, randomUUID } from "crypto";
import { basename, extname } from "path";
import { createConnection } from "net";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { register } from "prom-client";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import type { IsmsRequest } from "./types";
import { AdminOnly, isAdminIdentity } from "./security";
import { PrismaService } from "./prisma.service";
import { AuthorizationService, type Permission } from "./authorization.service";
import { ImportCertificateDto } from "./certificate.dto";
import {
  AccessRuleDto,
  AccessRuleBulkDto,
  AccessSimulationDto,
  AccessSnapshotDto,
  AnnualIncidentReportDto,
  CategoryDto,
  DirectoryConnectionDto,
  DirectoryGroupDto,
  DocumentMetadataDto,
  ImportDirectoryGroupDto,
  LocalePreferenceDto,
  SpaceDto,
  SpaceOwnerDto,
} from "./admin.dto";
import { AuditService } from "./audit.service";
import { StorageService } from "./storage.service";
import { AntivirusService } from "./antivirus.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";
import { parseCaCertificates } from "./certificate.parser";
import { validateDirectoryHosts } from "./directory-host";
import { WatermarkService } from "./watermark.service";
import { compareDocumentVersions } from "./document-diff";
import { SensitiveApprovalService } from "./sensitive-approval.service";
import { ObservabilityService } from "./observability.service";
import { safeSsoPath } from "./http-security";

const tcpCheck = (host: string, port: number, timeout = 1200) =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

export const certificateStatus = (validFrom: Date, validTo: Date) => {
  const now = new Date();
  if (validTo < now) return "expired";
  if (validFrom > now) return "not-yet-valid";
  const days = Math.ceil((validTo.getTime() - now.getTime()) / 86400000);
  if (days <= 90) return "expiring-soon";
  return "valid";
};

const certificateSelection = {
  id: true,
  name: true,
  subject: true,
  issuer: true,
  serialNumber: true,
  fingerprintSha256: true,
  validFrom: true,
  validTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

const accessPermissionKeys = [
  "showMenu",
  "read",
  "search",
  "preview",
  "download",
  "upload",
  "edit",
  "publish",
  "archive",
] as const;

const accessRuleData = (body: AccessRuleDto) => ({
  groupId: body.groupId,
  spaceId: body.spaceId,
  ...Object.fromEntries(accessPermissionKeys.map((key) => [key, body[key]])),
  validFrom: body.validFrom ? new Date(body.validFrom) : null,
  lifetime: body.lifetime ?? !body.validUntil,
  validUntil:
    (body.lifetime ?? !body.validUntil) || !body.validUntil
      ? null
      : new Date(body.validUntil),
  justification: body.justification?.trim() || null,
});

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly observability: ObservabilityService,
  ) {}

  @Get("health/live")
  live() {
    return { status: "ok" };
  }

  @Get("health/ready")
  async ready() {
    const checks = {
      postgres: await tcpCheck("postgres", 5432),
      redis: await tcpCheck("redis", 6379),
      documentStorage: await this.storage.healthCheck(),
      clamav: await tcpCheck("clamav", 3310),
    };
    if (Object.values(checks).some((healthy) => !healthy)) {
      throw new ServiceUnavailableException({ status: "error", checks });
    }
    return { status: "ok", checks };
  }

  @Get("health/details")
  @AdminOnly()
  async details() {
    const [lastSync, certificates] = await Promise.all([
      this.prisma.directorySyncJob.findFirst({
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.trustedCaCertificate.findMany({
        select: { id: true, name: true, validFrom: true, validTo: true },
      }),
    ]);
    return {
      services: {
        postgres: await tcpCheck("postgres", 5432),
        redis: await tcpCheck("redis", 6379),
        documentStorage: await this.storage.healthCheck(),
        clamav: await tcpCheck("clamav", 3310),
      },
      lastDirectorySync: lastSync,
      certificates: certificates.map((certificate) => ({
        ...certificate,
        status: certificateStatus(certificate.validFrom, certificate.validTo),
      })),
    };
  }

  @Get("metrics")
  async metrics(@Res() response: Response) {
    await this.observability.collect({
      postgres: await tcpCheck("postgres", 5432),
      redis: await tcpCheck("redis", 6379),
      documentStorage: await this.storage.healthCheck(),
      clamav: await tcpCheck("clamav", 3310),
    });
    response.type(register.contentType).send(await register.metrics());
  }
}

@ApiTags("identity")
@Controller("me")
export class IdentityController {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(@Req() req: IsmsRequest) {
    const administrator = isAdminIdentity(req.identity.groups);
    const matchedGroupsPromise =
      !administrator && req.identity.groups.length > 0
        ? this.prisma.directoryGroup.findMany({
            where: {
              active: true,
              OR: req.identity.groups.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
            select: { name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]);
    const [spaces, preference, adminAccount, matchedGroups] = await Promise.all(
      [
        this.authorization.permittedSpaces(req.identity.groups, "showMenu"),
        this.prisma.userPreference.findUnique({
          where: { identity: req.identity.username },
        }),
        this.prisma.adminAccount.findUnique({
          where: { username: req.identity.username },
          select: { primary: true },
        }),
        matchedGroupsPromise,
      ],
    );
    const permissionNames: Permission[] = [
      "showMenu",
      "read",
      "search",
      "preview",
      "download",
      "upload",
      "edit",
      "publish",
      "archive",
    ];
    return {
      username: req.identity.username,
      displayName: req.identity.displayName,
      profilePhoto: req.identity.profilePhoto || null,
      isAdmin: administrator,
      primaryAdmin: adminAccount?.primary || false,
      locale: preference?.locale || null,
      preferences: {
        viewMode: preference?.viewMode || "list",
        density: preference?.density || "comfortable",
        textScale: preference?.textScale || 100,
        highContrast: preference?.highContrast || false,
        reducedMotion: preference?.reducedMotion || false,
      },
      authentication: {
        source: req.identity.source,
        ssoConnected: req.identity.source === "trusted-proxy",
        sessionExpiresAt: req.identity.sessionExpiresAt || null,
        loginUrl: safeSsoPath(process.env.SSO_LOGIN_URL),
        logoutUrl: safeSsoPath(process.env.SSO_LOGOUT_URL),
        diagnostics: {
          groupCount: req.identity.groups.length,
          matchedGroups: matchedGroups.map((group) => group.name),
          mappedSpaceCount: spaces.length,
          administrator,
          administratorAccount: administrator,
        },
      },
      spaces: spaces.map(({ accessRules, categories, ...space }) => ({
        ...space,
        categories: categories.map(({ _count, ...category }) => ({
          ...category,
          documentCount: _count.documents,
        })),
        permissions: Object.fromEntries(
          permissionNames.map((permission) => [
            permission,
            administrator ||
              accessRules.some((rule) => Boolean(rule[permission])),
          ]),
        ),
        accessExplanation: administrator
          ? { type: "administrator", groups: [] }
          : space.ownerGroup &&
              space.ownerGroup.active &&
              req.identity.groups.some(
                (name) =>
                  name.toLowerCase() === space.ownerGroup!.name.toLowerCase(),
              )
            ? { type: "owner", groups: [space.ownerGroup.name] }
            : {
                type: "rule",
                groups: [
                  ...new Set(
                    accessRules
                      .map((rule) => rule.group?.name)
                      .filter((name): name is string => Boolean(name)),
                  ),
                ],
              },
      })),
    };
  }

  @Put("preferences")
  async preference(@Req() req: IsmsRequest, @Body() body: LocalePreferenceDto) {
    return this.prisma.userPreference.upsert({
      where: { identity: req.identity.username },
      update: { locale: body.locale },
      create: { identity: req.identity.username, locale: body.locale },
    });
  }
}

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
    private readonly audit: AuditService,
    private readonly watermark: WatermarkService,
  ) {}

  @Get()
  async list(
    @Req() req: IsmsRequest,
    @Query("q") query = "",
    @Query("category") category?: string,
    @Query("categoryId") categoryId?: string,
    @Query("space") space?: string,
    @Query("sort") sort: "recent" | "popular" = "recent",
    @Query("page") pageValue?: string,
    @Query("limit") limitValue = "10",
    @Query("favorites") favorites = "false",
    @Query("format") format = "",
    @Query("locale") documentLocale = "",
    @Query("sensitive") sensitive = "",
  ) {
    const q = query.trim().slice(0, 200);
    const requestedPage = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 10));
    const paginated = Boolean(pageValue);
    const mimeByFormat: Record<string, string> = {
      pdf: "application/pdf",
      docx: allowedExtensions[".docx"][0],
      xlsx: allowedExtensions[".xlsx"][0],
    };
    const selectedMime = mimeByFormat[format.toLowerCase()];
    const selectedLocale = ["fr", "en"].includes(documentLocale)
      ? documentLocale
      : "";
    const emptyResult = paginated
      ? { items: [], page: 1, limit, total: 0, totalPages: 0 }
      : [];
    const listingPermission = q ? "search" : "read";
    const permissionNames = [
      "preview",
      "download",
      "upload",
      "edit",
      "publish",
      "archive",
    ] as const satisfies readonly Permission[];
    const spacesByPermission = await this.authorization.permittedSpacesFor(
      req.identity.groups,
      [listingPermission, ...permissionNames],
    );
    const spaces = spacesByPermission.get(listingPermission)!;
    const permissionEntries = permissionNames.map(
      (permission) =>
        [permission, spacesByPermission.get(permission)!] as const,
    );
    const permissionSpaces = permissionEntries.reduce(
      (result, [permission, records]) => {
        result[permission] = new Set(records.map((item) => item.id));
        return result;
      },
      {} as Record<(typeof permissionNames)[number], Set<string>>,
    );
    const knownSpaces = new Map(
      [...spaces, ...permissionEntries.flatMap(([, records]) => records)].map(
        (item) => [item.id, item],
      ),
    );
    const requestedSpaceIds = new Set(
      [...knownSpaces.values()]
        .filter((item) => !space || item.slug === space)
        .map((item) => item.id),
    );
    const readableSpaceIds = spaces
      .filter((item) => requestedSpaceIds.has(item.id))
      .map((item) => item.id);
    const manageableSpaceIds = new Set(
      ["edit", "publish", "archive"].flatMap((permission) => [
        ...permissionSpaces[permission as keyof typeof permissionSpaces],
      ]),
    );
    const managedSpaceIds = [...manageableSpaceIds].filter(
      (spaceId) =>
        requestedSpaceIds.has(spaceId) &&
        (!q || readableSpaceIds.includes(spaceId)),
    );
    const visibleSpaceIds = [
      ...new Set([...readableSpaceIds, ...managedSpaceIds]),
    ];
    if (visibleSpaceIds.length === 0) return emptyResult;
    let categoryWhere: Prisma.DocumentCategoryWhereInput | undefined;
    const categoryIdIsUuid = Boolean(
      categoryId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          categoryId,
        ),
    );
    if (categoryIdIsUuid) {
      categoryWhere = {
        id: categoryId,
        deletedAt: null,
        spaceId: { in: visibleSpaceIds },
      };
    } else if (category || categoryId) {
      // Legacy links used a slug alone. A slug is only unique within a space,
      // therefore reject ambiguous requests instead of mixing categories.
      const slug = category || categoryId!;
      const matches = await this.prisma.documentCategory.findMany({
        where: {
          slug,
          deletedAt: null,
          spaceId: { in: visibleSpaceIds },
        },
        select: { id: true },
        take: 2,
      });
      if (matches.length > 1)
        throw new BadRequestException(
          "Category slug is ambiguous; use categoryId",
        );
      categoryWhere = matches.length
        ? { id: matches[0].id, deletedAt: null }
        : { id: "__missing_category__", deletedAt: null };
    }
    const fullTextMatches = q
      ? await this.prisma.$queryRaw<Array<{ documentId: string }>>(Prisma.sql`
          SELECT DISTINCT "documentId"
          FROM "DocumentTranslation"
          WHERE to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", ''))
            @@ websearch_to_tsquery('simple', ${q})
          LIMIT 500
        `)
      : [];
    if (q && fullTextMatches.length === 0) return emptyResult;
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      OR: [
        { status: "PUBLISHED", spaceId: { in: readableSpaceIds } },
        { spaceId: { in: managedSpaceIds } },
      ],
      ...(q
        ? { id: { in: fullTextMatches.map((match) => match.documentId) } }
        : {}),
      ...(categoryWhere ? { category: categoryWhere } : {}),
      ...(favorites === "true"
        ? { favorites: { some: { identity: req.identity.username } } }
        : {}),
      ...(sensitive === "true" || sensitive === "false"
        ? { sensitive: sensitive === "true" }
        : {}),
      ...(selectedMime || selectedLocale
        ? {
            versions: {
              some: {
                ...(selectedLocale ? { locale: selectedLocale } : {}),
                ...(selectedMime
                  ? { storedFile: { mimeType: selectedMime } }
                  : {}),
              },
            },
          }
        : {}),
    };
    const total = await this.prisma.document.count({ where });
    const totalPages = Math.ceil(total / limit);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const documents = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        slug: true,
        status: true,
        sensitive: true,
        watermarkPosition: true,
        publishedAt: true,
        viewCount: true,
        downloadCount: true,
        space: {
          select: { id: true, slug: true, nameFr: true, nameEn: true },
        },
        category: {
          select: { id: true, slug: true, nameFr: true, nameEn: true },
        },
        translations: {
          select: { locale: true, title: true, description: true },
        },
        versions: {
          select: {
            id: true,
            locale: true,
            version: true,
            changeSummary: true,
            changeDetails: true,
            storedFile: {
              select: { mimeType: true, originalName: true, size: true },
            },
          },
          orderBy: { version: "desc" },
        },
        reviews: {
          where: { status: "APPROVED", decidedAt: { not: null } },
          select: {
            id: true,
            owner: true,
            reviewer: true,
            approver: true,
            decisionComment: true,
            decidedBy: true,
            decidedAt: true,
            dueAt: true,
            version: { select: { locale: true, version: true } },
          },
          orderBy: { decidedAt: "desc" },
          take: 5,
        },
        favorites: {
          where: { identity: req.identity.username },
          select: { identity: true },
          take: 1,
        },
      },
      orderBy:
        sort === "popular"
          ? [
              { viewCount: "desc" },
              { downloadCount: "desc" },
              { publishedAt: "desc" },
            ]
          : { publishedAt: "desc" },
      skip: paginated ? (page - 1) * limit : undefined,
      take: paginated ? limit : 100,
    });
    const items = documents.map((document) => ({
      ...document,
      favorite: document.favorites.length > 0,
      permissions: {
        preview: permissionSpaces.preview.has(document.space.id),
        download: permissionSpaces.download.has(document.space.id),
        upload: permissionSpaces.upload.has(document.space.id),
        edit: permissionSpaces.edit.has(document.space.id),
        publish: permissionSpaces.publish.has(document.space.id),
        archive: permissionSpaces.archive.has(document.space.id),
      },
      versions: document.versions.map((version) => ({
        ...version,
        storedFile: {
          ...version.storedFile,
          size: version.storedFile.size.toString(),
        },
      })),
      favorites: undefined,
    }));
    return paginated
      ? {
          items,
          page,
          limit,
          total,
          totalPages,
        }
      : items;
  }

  @Post(":id/favorite")
  async addFavorite(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: "PUBLISHED" },
      select: { id: true, spaceId: true },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        "read",
      ))
    )
      throw new NotFoundException();
    await this.prisma.userFavorite.upsert({
      where: {
        identity_documentId: {
          identity: req.identity.username,
          documentId: document.id,
        },
      },
      update: {},
      create: { identity: req.identity.username, documentId: document.id },
    });
    return { favorite: true };
  }

  @Delete(":id/favorite")
  async removeFavorite(@Req() req: IsmsRequest, @Param("id") id: string) {
    await this.prisma.userFavorite.deleteMany({
      where: { identity: req.identity.username, documentId: id },
    });
    return { favorite: false };
  }

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: IsmsRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new BadRequestException("A file is required");
    if (!["fr", "en"].includes(body.locale))
      throw new BadRequestException("Locale must be fr or en");
    if (!body.spaceId || !body.title?.trim())
      throw new BadRequestException("spaceId and title are required");
    const sensitive = body.sensitive === "true";
    const watermarkPosition = parseWatermarkPosition(body.watermarkPosition);
    const existing = body.documentId
      ? await this.prisma.document.findFirst({
          where: { id: body.documentId, deletedAt: null },
          select: { id: true, spaceId: true },
        })
      : null;
    if (body.documentId && !existing) throw new NotFoundException();
    if (existing && existing.spaceId !== body.spaceId)
      throw new BadRequestException(
        "A version must remain in its document space",
      );
    const requiredPermission: Permission = existing ? "edit" : "upload";
    if (
      !(await this.authorization.can(
        req.identity.groups,
        body.spaceId,
        requiredPermission,
      ))
    )
      throw new NotFoundException();
    const extension = extname(file.originalname).toLowerCase();
    if (
      !allowedExtensions[extension]?.includes(file.mimetype) ||
      !magicMatches(file.buffer, extension)
    )
      throw new BadRequestException(
        "File extension, MIME type and content are inconsistent",
      );
    const [space, category] = await Promise.all([
      this.prisma.documentSpace.findFirst({
        where: { id: body.spaceId, deletedAt: null },
      }),
      body.categoryId
        ? this.prisma.documentCategory.findFirst({
            where: {
              id: body.categoryId,
              spaceId: body.spaceId,
              deletedAt: null,
            },
          })
        : Promise.resolve(null),
    ]);
    if (!space || (body.categoryId && !category))
      throw new BadRequestException("Invalid space or category");
    const scan = await this.antivirus.scan(file.buffer);
    const documentId = existing?.id || randomUUID();
    const objectKey = `${scan.status === "CLEAN" ? "documents" : "quarantine"}/${documentId}/${body.locale}/${randomUUID()}${extension}`;
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    await this.storage.putObject(objectKey, file.buffer, {
      "Content-Type": file.mimetype,
      "X-Amz-Meta-Sha256": sha256,
    });
    const result = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        await tx.document.create({
          data: {
            id: documentId,
            slug: canonicalDocumentSlug(body.title.trim(), documentId),
            spaceId: body.spaceId,
            categoryId: body.categoryId || null,
            sensitive,
            watermarkPosition,
            status: scan.status === "CLEAN" ? "DRAFT" : "QUARANTINED",
          },
        });
      }
      const latest = await tx.documentVersion.findFirst({
        where: { documentId, locale: body.locale },
        orderBy: { version: "desc" },
        include: { storedFile: true },
      });
      const automatedChange = latest
        ? compareDocumentVersions(
            await this.storage.getBuffer(latest.storedFile.objectKey),
            file.buffer,
            extension,
          )
        : {
            details: { added: [], removed: [], modified: [] },
            summary: "Initial version",
          };
      const storedFile = await tx.storedFile.create({
        data: {
          objectKey,
          originalName: basename(file.originalname).replace(/[\r\n]/g, "_"),
          mimeType: file.mimetype,
          size: BigInt(file.size),
          sha256,
          scans: {
            create: {
              status: scan.status,
              signature: "signature" in scan ? scan.signature : null,
              scannedAt: new Date(),
            },
          },
        },
      });
      await tx.documentVersion.create({
        data: {
          documentId,
          locale: body.locale,
          version: (latest?.version || 0) + 1,
          storedFileId: storedFile.id,
          changeSummary: body.changeSummary?.trim() || automatedChange.summary,
          changeDetails: automatedChange.details,
        },
      });
      await tx.documentTranslation.upsert({
        where: { documentId_locale: { documentId, locale: body.locale } },
        update: {
          title: body.title.trim(),
          description: body.description?.trim() || null,
        },
        create: {
          documentId,
          locale: body.locale,
          title: body.title.trim(),
          description: body.description?.trim() || null,
        },
      });
      return tx.document.findUnique({
        where: { id: documentId },
        include: { translations: true, versions: true },
      });
    });
    await this.audit.record(
      req,
      existing ? "document.version.upload" : "document.upload",
      `document:${documentId}`,
      scan.status === "CLEAN" ? "success" : "failure",
      { locale: body.locale, scanStatus: scan.status, size: file.size, sha256 },
    );
    return result;
  }

  @Put(":id/metadata")
  async updateMetadata(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: DocumentMetadataDto,
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, spaceId: true },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        "edit",
      ))
    )
      throw new NotFoundException();
    const translation = await this.prisma.documentTranslation.upsert({
      where: { documentId_locale: { documentId: id, locale: body.locale } },
      update: {
        title: body.title.trim(),
        description: body.description?.trim() || null,
      },
      create: {
        documentId: id,
        locale: body.locale,
        title: body.title.trim(),
        description: body.description?.trim() || null,
      },
    });
    await this.audit.record(
      req,
      "document.metadata.update",
      `document:${id}`,
      "success",
      {
        locale: body.locale,
      },
    );
    return translation;
  }

  @Post(":id/publish")
  async userPublish(@Req() req: IsmsRequest, @Param("id") id: string) {
    return this.transition(req, id, "publish", "PUBLISHED");
  }

  @Post(":id/archive")
  async userArchive(@Req() req: IsmsRequest, @Param("id") id: string) {
    return this.transition(req, id, "archive", "ARCHIVED");
  }

  @Post(":id/restore")
  async userRestore(@Req() req: IsmsRequest, @Param("id") id: string) {
    return this.transition(req, id, "archive", "DRAFT");
  }

  private async transition(
    req: IsmsRequest,
    id: string,
    permission: "publish" | "archive",
    status: "PUBLISHED" | "ARCHIVED" | "DRAFT",
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: { include: { storedFile: { include: { scans: true } } } },
        favorites: { select: { identity: true } },
        translations: { select: { title: true, locale: true } },
      },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        permission,
      ))
    )
      throw new NotFoundException();
    if (
      status === "PUBLISHED" &&
      (document.versions.length === 0 ||
        document.versions.some(
          (version) =>
            !version.storedFile.scans.some((scan) => scan.status === "CLEAN"),
        ))
    )
      throw new ConflictException(
        "Every document version must pass antivirus scanning",
      );
    const distributedFiles =
      status === "PUBLISHED"
        ? await this.watermark.prepareForPublication(document.id)
        : [];
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        status,
        ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
      },
    });
    await this.audit.record(
      req,
      `document.${status.toLowerCase()}`,
      `document:${id}`,
      "success",
      distributedFiles.length ? { distributedFiles } : undefined,
    );
    if (status === "PUBLISHED" && document.favorites.length > 0) {
      const title =
        document.translations.find((item) => item.locale === "fr")?.title ||
        document.translations[0]?.title ||
        id;
      await this.prisma.userNotification.createMany({
        data: document.favorites.map(({ identity }) => ({
          identity,
          title: "Document publié ou mis à jour",
          message: title,
          resourceType: "document",
          resourceId: id,
        })),
      });
    }
    return updated;
  }

  @Get(":id")
  async one(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: "PUBLISHED" },
      include: {
        translations: true,
        category: true,
        space: true,
        favorites: {
          where: { identity: req.identity.username },
          select: { identity: true },
          take: 1,
        },
        reviews: {
          where: { status: "APPROVED", decidedAt: { not: null } },
          select: {
            id: true,
            owner: true,
            reviewer: true,
            approver: true,
            decisionComment: true,
            decidedBy: true,
            decidedAt: true,
            dueAt: true,
            version: { select: { locale: true, version: true } },
          },
          orderBy: { decidedAt: "desc" },
          take: 5,
        },
        versions: {
          select: {
            id: true,
            locale: true,
            version: true,
            createdAt: true,
            changeSummary: true,
            changeDetails: true,
            storedFile: {
              select: { originalName: true, mimeType: true, size: true },
            },
          },
          orderBy: [{ locale: "asc" }, { version: "desc" }],
        },
      },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        "read",
      ))
    ) {
      await this.audit
        .record(req, "authorization.denied", `document:${id}`, "denied")
        .catch(() => undefined);
      throw new NotFoundException();
    }
    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      }),
      this.prisma.userDocumentActivity.upsert({
        where: {
          identity_documentId_action: {
            identity: req.identity.username,
            documentId: id,
            action: "view",
          },
        },
        update: { occurredAt: new Date() },
        create: {
          identity: req.identity.username,
          documentId: id,
          action: "view",
        },
      }),
    ]);
    const permissionNames = [
      "preview",
      "download",
      "upload",
      "edit",
      "publish",
      "archive",
    ] as const satisfies readonly Permission[];
    const permissionValues = await Promise.all(
      permissionNames.map((permission) =>
        this.authorization.can(
          req.identity.groups,
          document.spaceId,
          permission,
        ),
      ),
    );
    const permissions = Object.fromEntries(
      permissionNames.map((permission, index) => [
        permission,
        permissionValues[index],
      ]),
    );
    return {
      ...document,
      favorite: document.favorites.length > 0,
      favorites: undefined,
      permissions,
      versions: document.versions.map((version) => ({
        ...version,
        storedFile: {
          ...version.storedFile,
          size: version.storedFile.size.toString(),
        },
      })),
    };
  }

  @Get("by-slug/:slug")
  async bySlug(@Req() req: IsmsRequest, @Param("slug") slug: string) {
    const document = await this.prisma.document.findFirst({
      where: { slug, deletedAt: null, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!document) throw new NotFoundException();
    return this.one(req, document.id);
  }

  @Get(":id/content")
  async preview(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param("id") id: string,
    @Query("locale") locale = "fr",
  ) {
    return this.stream(req, response, id, locale, "preview", true);
  }

  @Get(":id/download")
  async download(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param("id") id: string,
    @Query("locale") locale = "fr",
  ) {
    return this.stream(req, response, id, locale, "download", false);
  }

  private async stream(
    req: IsmsRequest,
    response: Response,
    id: string,
    locale: string,
    permission: Permission,
    inline: boolean,
  ) {
    if (!["fr", "en"].includes(locale))
      throw new BadRequestException("Unsupported locale");
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: "PUBLISHED" },
      select: {
        id: true,
        spaceId: true,
        sensitive: true,
        versions: {
          where: { locale },
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, storedFile: true, distributedStoredFile: true },
        },
      },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        permission,
      ))
    ) {
      await this.audit
        .record(req, "authorization.denied", `document:${id}`, "denied")
        .catch(() => undefined);
      throw new NotFoundException();
    }
    const version = document.versions[0];
    let storedFile = document.sensitive
      ? version?.distributedStoredFile
      : version?.storedFile;
    if (document.sensitive && version && !storedFile) {
      await this.watermark.prepareForPublication(id);
      const refreshed = await this.prisma.documentVersion.findUnique({
        where: { id: version.id },
        select: { distributedStoredFile: true },
      });
      storedFile = refreshed?.distributedStoredFile || null;
    }
    if (!storedFile)
      throw new NotFoundException("Translation has no downloadable version");
    await this.prisma.userDocumentActivity.upsert({
      where: {
        identity_documentId_action: {
          identity: req.identity.username,
          documentId: id,
          action: permission,
        },
      },
      update: { occurredAt: new Date() },
      create: {
        identity: req.identity.username,
        documentId: id,
        action: permission,
      },
    });
    const safeName = basename(storedFile.originalName).replace(/[\r\n"]/g, "_");
    response.setHeader("Content-Type", storedFile.mimeType);
    response.setHeader("Content-Length", storedFile.size.toString());
    response.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!inline) {
      await this.prisma.document.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      });
      if (document.sensitive)
        await this.audit.record(
          req,
          "document.download",
          `document:${id}`,
          "success",
          { locale },
        );
    }
    const stream = await this.storage.getObject(storedFile.objectKey);
    stream.on("error", () => {
      if (!response.headersSent)
        response.status(502).json({ message: "Stored file is unavailable" });
      else response.destroy();
    });
    stream.pipe(response);
  }
}

@ApiTags("incident-reports")
@Controller("incident-reports")
export class IncidentReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  publishedReports() {
    return this.prisma.annualIncidentReport.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        year: true,
        totalIncidents: true,
        criticalIncidents: true,
        resolvedIncidents: true,
        summary: true,
        lessonsLearned: true,
        updatedAt: true,
      },
      orderBy: { year: "desc" },
    });
  }
}

@ApiTags("administration")
@AdminOnly()
@Controller("admin")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly directory: DirectoryService,
    private readonly sensitiveApprovals: SensitiveApprovalService,
  ) {}

  private async validateAccessRuleTargets(body: AccessRuleDto) {
    const [group, space] = await Promise.all([
      this.prisma.directoryGroup.findFirst({
        where: { id: body.groupId, active: true },
        select: { id: true },
      }),
      this.prisma.documentSpace.findFirst({
        where: { id: body.spaceId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!group)
      throw new BadRequestException("Access rules require an active AD group");
    if (!space)
      throw new BadRequestException("Access rules require an active space");
    const validFrom = body.validFrom ? new Date(body.validFrom) : null;
    const validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.lifetime && validUntil)
      throw new BadRequestException("Lifetime access cannot have an expiry");
    if (validFrom && validUntil && validUntil <= validFrom)
      throw new BadRequestException("Access rule expiry must follow its start");
  }

  private validateIncidentReportCounts(body: AnnualIncidentReportDto) {
    if (
      body.criticalIncidents > body.totalIncidents ||
      body.resolvedIncidents > body.totalIncidents
    )
      throw new BadRequestException(
        "Critical and resolved incidents cannot exceed the total",
      );
  }

  @Get("incident-reports")
  incidentReports() {
    return this.prisma.annualIncidentReport.findMany({
      orderBy: { year: "desc" },
    });
  }

  @Post("incident-reports")
  async createIncidentReport(
    @Req() req: IsmsRequest,
    @Body() body: AnnualIncidentReportDto,
  ) {
    this.validateIncidentReportCounts(body);
    try {
      const report = await this.prisma.annualIncidentReport.create({
        data: { ...body, lessonsLearned: body.lessonsLearned || null },
      });
      await this.audit.record(
        req,
        "incident-report.create",
        `incident-report:${report.id}`,
        "success",
        { year: report.year, status: report.status },
      );
      return report;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("A report already exists for this year");
      throw error;
    }
  }

  @Put("incident-reports/:id")
  async updateIncidentReport(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: AnnualIncidentReportDto,
  ) {
    this.validateIncidentReportCounts(body);
    try {
      const report = await this.prisma.annualIncidentReport.update({
        where: { id },
        data: { ...body, lessonsLearned: body.lessonsLearned || null },
      });
      await this.audit.record(
        req,
        "incident-report.update",
        `incident-report:${id}`,
        "success",
        { year: report.year, status: report.status },
      );
      return report;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("A report already exists for this year");
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        throw new NotFoundException();
      throw error;
    }
  }

  @Delete("incident-reports/:id")
  async deleteIncidentReport(@Req() req: IsmsRequest, @Param("id") id: string) {
    try {
      const report = await this.prisma.annualIncidentReport.delete({
        where: { id },
      });
      await this.audit.record(
        req,
        "incident-report.delete",
        `incident-report:${id}`,
        "success",
        { year: report.year },
      );
      return { deleted: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        throw new NotFoundException();
      throw error;
    }
  }

  @Get("check")
  async check(@Req() req: IsmsRequest) {
    const [preference, account, mappedSpaceCount] = await Promise.all([
      this.prisma.userPreference.findUnique({
        where: { identity: req.identity.username },
      }),
      this.prisma.adminAccount.findUnique({
        where: { username: req.identity.username },
        select: { primary: true },
      }),
      this.prisma.documentSpace.count({ where: { deletedAt: null } }),
    ]);
    return {
      authorized: true,
      isAdmin: true,
      username: req.identity.username,
      displayName: req.identity.displayName,
      profilePhoto: req.identity.profilePhoto || null,
      primaryAdmin: account?.primary || false,
      locale: preference?.locale || null,
      authentication: {
        source: req.identity.source,
        ssoConnected: req.identity.source === "trusted-proxy",
        sessionExpiresAt: req.identity.sessionExpiresAt || null,
        loginUrl: safeSsoPath(process.env.SSO_LOGIN_URL),
        logoutUrl: safeSsoPath(process.env.SSO_LOGOUT_URL),
        diagnostics: {
          groupCount: req.identity.groups.length,
          mappedSpaceCount,
          administrator: true,
          administratorAccount: isAdminIdentity(req.identity.groups),
        },
      },
    };
  }

  @Get("dashboard")
  async dashboard() {
    const warningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [
      groups,
      rules,
      spaces,
      documents,
      syncErrors,
      quarantined,
      drafts,
      expiringCertificates,
      failingConnections,
    ] = await Promise.all([
      this.prisma.directoryGroup.count({ where: { active: true } }),
      this.prisma.accessRule.count(),
      this.prisma.documentSpace.count({ where: { deletedAt: null } }),
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.directorySyncJob.count({ where: { status: "ERROR" } }),
      this.prisma.document.count({
        where: { deletedAt: null, status: "QUARANTINED" },
      }),
      this.prisma.document.count({
        where: { deletedAt: null, status: "DRAFT" },
      }),
      this.prisma.trustedCaCertificate.count({
        where: { validTo: { lte: warningDate } },
      }),
      this.prisma.directoryConnection.count({
        where: { enabled: true, lastTestStatus: "ERROR" },
      }),
    ]);
    return {
      groups,
      rules,
      spaces,
      documents,
      syncErrors,
      attention: {
        total:
          syncErrors +
          quarantined +
          drafts +
          expiringCertificates +
          failingConnections,
        syncErrors,
        failingConnections,
        expiringCertificates,
        quarantined,
        drafts,
      },
    };
  }

  @Get("groups")
  async groups(
    @Query("q") query = "",
    @Query("page") pageValue?: string,
    @Query("limit") limitValue = "50",
    @Query("sort") sort = "name",
    @Query("order") order: "asc" | "desc" = "asc",
  ) {
    const q = query.trim().slice(0, 120);
    const where: Prisma.DirectoryGroupWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { distinguishedName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitValue) || 50));
    const orderBy =
      sort === "memberCount"
        ? { memberCount: order }
        : sort === "lastSyncedAt"
          ? { lastSyncedAt: order }
          : { name: order };
    const queryOptions: Prisma.DirectoryGroupFindManyArgs = {
      where,
      include: {
        accessRules: {
          select: {
            id: true,
            space: {
              select: { id: true, slug: true, nameFr: true, nameEn: true },
            },
          },
        },
      },
      orderBy,
      ...(pageValue ? { skip: (page - 1) * limit, take: limit } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.directoryGroup.findMany(queryOptions),
      this.prisma.directoryGroup.count({ where }),
    ]);
    return pageValue ? { items, page, limit, total } : items;
  }

  @Post("groups")
  async createGroup(@Req() req: IsmsRequest, @Body() body: DirectoryGroupDto) {
    try {
      const group = await this.prisma.directoryGroup.create({
        data: {
          name: body.name.trim(),
          distinguishedName: body.distinguishedName.trim(),
          description: body.description?.trim() || null,
          active: true,
        },
      });
      await this.audit.record(
        req,
        "directory-group.create",
        `directory-group:${group.id}`,
        "success",
        {
          name: group.name,
          distinguishedName: group.distinguishedName,
          source: "manual",
        },
      );
      return group;
    } catch {
      throw new ConflictException(
        "A group with this name or distinguished name already exists",
      );
    }
  }

  @Post("groups/import")
  async importGroup(
    @Req() req: IsmsRequest,
    @Body() body: ImportDirectoryGroupDto,
  ) {
    const group = await this.directory.importGroup(
      body.connectionId,
      body.distinguishedName,
    );
    await this.audit.record(
      req,
      "directory-group.import",
      `directory-group:${group.id}`,
      "success",
      {
        name: group.name,
        distinguishedName: group.distinguishedName,
        source: "directory",
      },
    );
    return group;
  }

  @Delete("groups/:id")
  async deleteGroup(@Req() req: IsmsRequest, @Param("id") id: string) {
    const group = await this.prisma.directoryGroup.findUnique({
      where: { id },
      include: { _count: { select: { accessRules: true } } },
    });
    if (!group) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.accessRule.deleteMany({ where: { groupId: id } }),
      this.prisma.directoryGroup.delete({ where: { id } }),
    ]);
    await this.audit.record(
      req,
      "directory-group.delete",
      `directory-group:${id}`,
      "success",
      {
        name: group.name,
        synchronized: Boolean(group.lastSyncedAt),
        deletedAccessRules: group._count.accessRules,
      },
    );
    return {
      deleted: true,
      synchronized: Boolean(group.lastSyncedAt),
      deletedAccessRules: group._count.accessRules,
    };
  }

  @Get("access-rules")
  async rules(
    @Query("q") query = "",
    @Query("page") pageValue?: string,
    @Query("limit") limitValue = "50",
    @Query("order") order: "asc" | "desc" = "asc",
  ) {
    const q = query.trim().slice(0, 120);
    const where: Prisma.AccessRuleWhereInput = q
      ? {
          OR: [
            { group: { name: { contains: q, mode: "insensitive" as const } } },
            {
              space: { nameFr: { contains: q, mode: "insensitive" as const } },
            },
            {
              space: { nameEn: { contains: q, mode: "insensitive" as const } },
            },
          ],
        }
      : {};
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitValue) || 50));
    const options: Prisma.AccessRuleFindManyArgs = {
      where,
      include: { group: true, space: true },
      orderBy: [{ group: { name: order } }, { space: { slug: order } }],
      ...(pageValue ? { skip: (page - 1) * limit, take: limit } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.accessRule.findMany(options),
      this.prisma.accessRule.count({ where }),
    ]);
    return pageValue ? { items, page, limit, total } : items;
  }

  @Post("access-rules")
  async createRule(@Req() req: IsmsRequest, @Body() body: AccessRuleDto) {
    await this.validateAccessRuleTargets(body);
    try {
      const rule = await this.prisma.accessRule.create({
        data: accessRuleData(body),
        include: { group: true, space: true },
      });
      await this.audit.record(
        req,
        "access-rule.create",
        `access-rule:${rule.id}`,
        "success",
        { groupId: body.groupId, spaceId: body.spaceId },
      );
      return rule;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "A rule already exists for this group and space",
        );
      throw error;
    }
  }

  @Put("access-rules/:id")
  async updateRule(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: AccessRuleDto,
  ) {
    const existing = await this.prisma.accessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.validateAccessRuleTargets(body);
    let rule;
    try {
      rule = await this.prisma.accessRule.update({
        where: { id },
        data: accessRuleData(body),
        include: { group: true, space: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "A rule already exists for this group and space",
        );
      throw error;
    }
    await this.audit.record(
      req,
      "access-rule.update",
      `access-rule:${id}`,
      "success",
      { before: existing, after: body },
    );
    return rule;
  }

  @Delete("access-rules/:id")
  async deleteRule(@Req() req: IsmsRequest, @Param("id") id: string) {
    const existing = await this.prisma.accessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.accessRule.delete({ where: { id } });
    await this.audit.record(
      req,
      "access-rule.delete",
      `access-rule:${id}`,
      "success",
      { groupId: existing.groupId, spaceId: existing.spaceId },
    );
    return { deleted: true };
  }

  @Post("access-rules/simulate")
  async simulateAccess(@Body() body: AccessSimulationDto) {
    const session = body.identity
      ? await this.prisma.directoryUserSession.findFirst({
          where: { username: { equals: body.identity, mode: "insensitive" } },
          orderBy: { lastUsedAt: "desc" },
          select: { username: true, displayName: true, groups: true },
        })
      : null;
    const groups = [
      ...new Set([
        ...body.groups.map((group) => group.trim()).filter(Boolean),
        ...((session?.groups as string[] | undefined) || []),
      ]),
    ].slice(0, 512);
    const permissions = await this.authorization.permittedSpacesFor(
      groups,
      accessPermissionKeys,
    );
    const spaces = await this.prisma.documentSpace.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, nameFr: true, nameEn: true },
      orderBy: { slug: "asc" },
    });
    return {
      identity: session
        ? { username: session.username, displayName: session.displayName }
        : null,
      groups,
      spaces: spaces.map((space) => ({
        ...space,
        permissions: Object.fromEntries(
          accessPermissionKeys.map((permission) => [
            permission,
            permissions
              .get(permission)!
              .some((permitted) => permitted.id === space.id),
          ]),
        ),
      })),
    };
  }

  @Get("access-rules/anomalies")
  async accessAnomalies() {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rules = await this.prisma.accessRule.findMany({
      include: { group: true, space: true },
      orderBy: { updatedAt: "desc" },
    });
    return rules.flatMap((rule) => {
      const permissions = accessPermissionKeys.filter((key) => rule[key]);
      const anomalies: Array<{
        type: string;
        severity: string;
        message: string;
      }> = [];
      if (!rule.group.active)
        anomalies.push({
          type: "INACTIVE_GROUP",
          severity: "high",
          message: "Rule targets an inactive group",
        });
      if (rule.validUntil && rule.validUntil <= now)
        anomalies.push({
          type: "EXPIRED",
          severity: "high",
          message: "Rule has expired",
        });
      else if (rule.validUntil && rule.validUntil <= soon)
        anomalies.push({
          type: "EXPIRING",
          severity: "medium",
          message: "Rule expires within 30 days",
        });
      if (permissions.length === 0)
        anomalies.push({
          type: "EMPTY",
          severity: "medium",
          message: "Rule grants no permission",
        });
      if (permissions.length === accessPermissionKeys.length)
        anomalies.push({
          type: "BROAD",
          severity: "low",
          message: "Rule grants every document permission",
        });
      if (!rule.justification)
        anomalies.push({
          type: "NO_JUSTIFICATION",
          severity: "low",
          message: "Rule has no justification",
        });
      return anomalies.map((anomaly) => ({
        ...anomaly,
        ruleId: rule.id,
        group: rule.group.name,
        space: rule.space.slug,
      }));
    });
  }

  @Post("access-rules/bulk")
  async bulkAccessRules(
    @Req() req: IsmsRequest,
    @Body() body: AccessRuleBulkDto,
  ) {
    for (const rule of body.rules) await this.validateAccessRuleTargets(rule);
    const saved = await this.prisma.$transaction(
      body.rules.map((rule) =>
        this.prisma.accessRule.upsert({
          where: {
            groupId_spaceId: { groupId: rule.groupId, spaceId: rule.spaceId },
          },
          update: accessRuleData(rule),
          create: accessRuleData(rule),
          include: { group: true, space: true },
        }),
      ),
    );
    await this.audit.record(
      req,
      "access-rule.bulk",
      "access-rules",
      "success",
      {
        count: saved.length,
      },
    );
    return saved;
  }

  @Post("access-rules/diff")
  async accessRuleDiff(@Body() body: AccessRuleBulkDto) {
    const existing = await this.prisma.accessRule.findMany();
    const byKey = new Map(
      existing.map((rule) => [`${rule.groupId}:${rule.spaceId}`, rule]),
    );
    return body.rules
      .map((rule) => {
        const current = byKey.get(`${rule.groupId}:${rule.spaceId}`);
        const changes = accessPermissionKeys
          .filter((key) => Boolean(current?.[key]) !== rule[key])
          .map((key) => ({
            permission: key,
            before: Boolean(current?.[key]),
            after: rule[key],
          }));
        return {
          groupId: rule.groupId,
          spaceId: rule.spaceId,
          newRule: !current,
          changes,
        };
      })
      .filter((entry) => entry.newRule || entry.changes.length > 0);
  }

  @Put("spaces/:id/owner")
  async setSpaceOwner(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: SpaceOwnerDto,
  ) {
    if (body.groupId) {
      const group = await this.prisma.directoryGroup.findFirst({
        where: { id: body.groupId, active: true },
        select: { id: true },
      });
      if (!group)
        throw new BadRequestException("Space owner must be an active group");
    }
    const space = await this.prisma.documentSpace.update({
      where: { id },
      data: { ownerGroupId: body.groupId || null },
      include: { ownerGroup: true },
    });
    await this.audit.record(
      req,
      "space.owner.update",
      `space:${id}`,
      "success",
      {
        ownerGroupId: body.groupId || null,
      },
    );
    return space;
  }

  private async accessState() {
    const [rules, spaces] = await Promise.all([
      this.prisma.accessRule.findMany({
        include: {
          group: { select: { name: true } },
          space: { select: { slug: true } },
        },
        orderBy: [{ groupId: "asc" }, { spaceId: "asc" }],
      }),
      this.prisma.documentSpace.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true, ownerGroupId: true },
        orderBy: { id: "asc" },
      }),
    ]);
    return { rules, spaces };
  }

  @Get("access-snapshots")
  accessSnapshots() {
    return this.prisma.accessSnapshot.findMany({
      select: {
        id: true,
        label: true,
        sha256: true,
        signature: true,
        identity: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  @Post("access-snapshots")
  async createAccessSnapshot(
    @Req() req: IsmsRequest,
    @Body() body: AccessSnapshotDto,
  ) {
    const state = await this.accessState();
    const serialized = JSON.stringify(state);
    const sha256 = createHash("sha256").update(serialized).digest("hex");
    const signatureKey = process.env.ENCRYPTION_KEY;
    if (!signatureKey)
      throw new ServiceUnavailableException(
        "ENCRYPTION_KEY is required to sign access snapshots",
      );
    const signature = createHmac("sha256", signatureKey)
      .update(sha256)
      .digest("hex");
    const snapshot = await this.prisma.accessSnapshot.create({
      data: {
        label: body.label.trim(),
        state,
        sha256,
        signature,
        identity: req.identity.username,
      },
    });
    await this.audit.record(
      req,
      "access-snapshot.create",
      `access-snapshot:${snapshot.id}`,
      "success",
      { sha256 },
    );
    return snapshot;
  }

  @Get("access-snapshots/compare")
  async compareAccessSnapshots(
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const snapshots = await this.prisma.accessSnapshot.findMany({
      where: { id: { in: [from, to] } },
    });
    const left = snapshots.find((snapshot) => snapshot.id === from);
    const right = snapshots.find((snapshot) => snapshot.id === to);
    if (!left || !right) throw new NotFoundException();
    type SnapshotRule = Record<string, unknown> & {
      groupId: string;
      spaceId: string;
    };
    type SnapshotSpace = {
      id: string;
      ownerGroupId: string | null;
    };
    type SnapshotState = { rules: SnapshotRule[]; spaces: SnapshotSpace[] };
    const normalize = (value: Prisma.JsonValue) => value as SnapshotState;
    const leftState = normalize(left.state);
    const rightState = normalize(right.state);
    const leftRules = new Map(
      leftState.rules.map((rule) => [`${rule.groupId}:${rule.spaceId}`, rule]),
    );
    const rightRules = new Map(
      rightState.rules.map((rule) => [`${rule.groupId}:${rule.spaceId}`, rule]),
    );
    const ruleKeys = new Set([...leftRules.keys(), ...rightRules.keys()]);
    const rules: Array<{
      key: string;
      change: "added" | "removed" | "updated";
      permissions?: Permission[];
      validityChanged?: boolean;
    }> = [];
    for (const key of ruleKeys) {
      const before = leftRules.get(key);
      const after = rightRules.get(key);
      if (!before) {
        rules.push({ key, change: "added" });
        continue;
      }
      if (!after) {
        rules.push({ key, change: "removed" });
        continue;
      }
      const permissions = accessPermissionKeys.filter(
        (permission) =>
          Boolean(before[permission]) !== Boolean(after[permission]),
      );
      const validityChanged =
        before.validFrom !== after.validFrom ||
        before.validUntil !== after.validUntil;
      if (permissions.length > 0 || validityChanged)
        rules.push({ key, change: "updated", permissions, validityChanged });
    }
    const leftSpaces = new Map(
      leftState.spaces.map((space) => [space.id, space]),
    );
    const owners = rightState.spaces.flatMap((space) => {
      const before = leftSpaces.get(space.id)?.ownerGroupId || null;
      const after = space.ownerGroupId || null;
      return before === after ? [] : [{ spaceId: space.id, before, after }];
    });
    return {
      from: { id: left.id, label: left.label, sha256: left.sha256 },
      to: { id: right.id, label: right.label, sha256: right.sha256 },
      changed: left.sha256 !== right.sha256,
      rules,
      owners,
      summary: {
        ruleChanges: rules.length,
        ownerChanges: owners.length,
      },
    };
  }

  @Get("access-snapshots/:id/export")
  async exportAccessSnapshot(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const snapshot = await this.prisma.accessSnapshot.findUnique({
      where: { id },
    });
    if (!snapshot) throw new NotFoundException();
    const approvalId = await this.sensitiveApprovals.require(
      req,
      "SENSITIVE_EXPORT",
      "ACCESS_SNAPSHOT",
      id,
      `Export signed access snapshot ${snapshot.label}`,
    );
    await this.sensitiveApprovals.execute(approvalId);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="access-snapshot-${snapshot.id}.json"`,
    );
    response.json({
      format: "isms-access-snapshot-v1",
      id: snapshot.id,
      label: snapshot.label,
      createdAt: snapshot.createdAt,
      identity: snapshot.identity,
      sha256: snapshot.sha256,
      signature: snapshot.signature,
      state: snapshot.state,
    });
  }

  @Get("access-attention")
  async accessAttention() {
    const [anomalies, ownersMissing, snapshots] = await Promise.all([
      this.accessAnomalies(),
      this.prisma.documentSpace.count({
        where: { deletedAt: null, ownerGroupId: null },
      }),
      this.prisma.accessSnapshot.count(),
    ]);
    return {
      total: anomalies.length + ownersMissing + Number(snapshots === 0),
      high: anomalies.filter((item) => item.severity === "high").length,
      anomalies: anomalies.length,
      spacesWithoutOwner: ownersMissing,
      snapshotMissing: snapshots === 0,
    };
  }

  @Get("spaces")
  spaces() {
    return this.prisma.documentSpace.findMany({
      where: { deletedAt: null },
      include: {
        categories: { where: { deletedAt: null } },
        ownerGroup: { select: { id: true, name: true, active: true } },
        _count: { select: { documents: true, accessRules: true } },
      },
      orderBy: { slug: "asc" },
    });
  }

  @Post("spaces")
  async createSpace(@Req() req: IsmsRequest, @Body() body: SpaceDto) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug))
      throw new BadRequestException("Invalid slug");
    const space = await this.prisma.documentSpace.create({
      data: { ...body, slug },
    });
    await this.audit.record(
      req,
      "space.create",
      `space:${space.id}`,
      "success",
      { slug },
    );
    return space;
  }

  @Put("spaces/:id")
  async updateSpace(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: SpaceDto,
  ) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug))
      throw new BadRequestException("Invalid slug");
    const space = await this.prisma.documentSpace.update({
      where: { id },
      data: { ...body, slug },
    });
    await this.audit.record(req, "space.update", `space:${id}`, "success", {
      slug,
    });
    return space;
  }

  @Delete("spaces/:id")
  async deleteSpace(@Req() req: IsmsRequest, @Param("id") id: string) {
    const existing = await this.prisma.documentSpace.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.documentSpace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record(req, "space.archive", `space:${id}`, "success");
    return { deleted: true };
  }

  @Delete("spaces/:id/permanent")
  async permanentlyDeleteSpace(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
  ) {
    const existing = await this.prisma.documentSpace.findUnique({
      where: { id },
      include: {
        _count: {
          select: { documents: true, categories: true, accessRules: true },
        },
      },
    });
    if (!existing) throw new NotFoundException();
    const dependencies = existing._count;
    if (
      dependencies.documents > 0 ||
      dependencies.categories > 0 ||
      dependencies.accessRules > 0
    ) {
      throw new ConflictException({
        message:
          "Document space must be empty before it can be permanently deleted",
        dependencies,
      });
    }
    const approval = await this.prisma.sensitiveOperationApproval.findFirst({
      where: {
        operation: "PERMANENT_DELETE",
        targetType: "DOCUMENT_SPACE",
        targetId: id,
        status: "APPROVED",
      },
      orderBy: { approvedAt: "desc" },
    });
    if (!approval) {
      const pending = await this.prisma.sensitiveOperationApproval.findFirst({
        where: {
          operation: "PERMANENT_DELETE",
          targetType: "DOCUMENT_SPACE",
          targetId: id,
          status: "PENDING",
        },
      });
      if (!pending)
        await this.prisma.sensitiveOperationApproval.create({
          data: {
            operation: "PERMANENT_DELETE",
            targetType: "DOCUMENT_SPACE",
            targetId: id,
            requestedBy: req.identity.username,
            reason: `Permanent deletion of empty document space ${existing.slug}`,
          },
        });
      throw new ConflictException(
        "A second administrator must approve this permanent deletion",
      );
    }
    await this.prisma.$transaction([
      this.prisma.documentSpace.delete({ where: { id } }),
      this.prisma.sensitiveOperationApproval.update({
        where: { id: approval.id },
        data: { status: "EXECUTED" },
      }),
    ]);
    await this.audit.record(req, "space.delete", `space:${id}`, "success", {
      slug: existing.slug,
    });
    return { deleted: true };
  }

  @Post("categories")
  async createCategory(@Req() req: IsmsRequest, @Body() body: CategoryDto) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug))
      throw new BadRequestException("Invalid slug");
    const space = await this.prisma.documentSpace.findFirst({
      where: { id: body.spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw new BadRequestException("Invalid active document space");
    const category = await this.prisma.documentCategory.create({
      data: { ...body, slug },
    });
    await this.audit.record(
      req,
      "category.create",
      `category:${category.id}`,
      "success",
      { spaceId: body.spaceId, slug },
    );
    return category;
  }

  @Put("categories/:id")
  async updateCategory(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: CategoryDto,
  ) {
    const existing = await this.prisma.documentCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException();
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug))
      throw new BadRequestException("Invalid slug");
    const space = await this.prisma.documentSpace.findFirst({
      where: { id: body.spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw new BadRequestException("Invalid active document space");
    if (existing.spaceId !== body.spaceId) {
      const documentCount = await this.prisma.document.count({
        where: { categoryId: id, deletedAt: null },
      });
      if (documentCount > 0)
        throw new ConflictException(
          "A category with documents cannot be moved between spaces",
        );
    }
    const category = await this.prisma.documentCategory.update({
      where: { id },
      data: { ...body, slug },
    });
    await this.audit.record(
      req,
      "category.update",
      `category:${id}`,
      "success",
      {
        before: {
          spaceId: existing.spaceId,
          slug: existing.slug,
          nameFr: existing.nameFr,
          nameEn: existing.nameEn,
        },
        after: {
          spaceId: body.spaceId,
          slug,
          nameFr: body.nameFr,
          nameEn: body.nameEn,
        },
      },
    );
    return category;
  }

  @Delete("categories/:id")
  async deleteCategory(@Req() req: IsmsRequest, @Param("id") id: string) {
    const existing = await this.prisma.documentCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException();
    const affectedDocuments = await this.prisma.document.count({
      where: { categoryId: id },
    });
    await this.prisma.$transaction([
      this.prisma.document.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.documentCategory.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
    await this.audit.record(
      req,
      "category.archive",
      `category:${id}`,
      "success",
      { affectedDocuments },
    );
    return { deleted: true, affectedDocuments };
  }

  @Get("audit")
  async auditEvents(
    @Query("page") pageValue = "1",
    @Query("limit") limitValue = "50",
    @Query("action") action?: string,
    @Query("result") result?: string,
  ) {
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitValue) || 50));
    const where: Prisma.AuditEventWhereInput = {
      ...(action
        ? { action: { contains: action, mode: "insensitive" as const } }
        : {}),
      ...(result ? { result } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  @Get("audit/export")
  async exportAudit(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Query("format") format = "json",
  ) {
    const normalizedFormat = format === "csv" ? "csv" : "json";
    const approvalId = await this.sensitiveApprovals.require(
      req,
      "SENSITIVE_EXPORT",
      "AUDIT_LOG",
      normalizedFormat,
      `Export audit log as ${normalizedFormat}`,
    );
    const items = await this.prisma.auditEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 10000,
    });
    await this.sensitiveApprovals.execute(approvalId);
    if (normalizedFormat === "csv") {
      const escape = (value: unknown) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = [
        [
          "occurredAt",
          "identity",
          "ipAddress",
          "action",
          "resource",
          "result",
          "correlationId",
        ].join(","),
        ...items.map((item) =>
          [
            item.occurredAt.toISOString(),
            item.identity,
            item.ipAddress,
            item.action,
            item.resource,
            item.result,
            item.correlationId,
          ]
            .map(escape)
            .join(","),
        ),
      ];
      response
        .type("text/csv")
        .attachment("isms-audit.csv")
        .send(lines.join("\n"));
      return;
    }
    response
      .type("application/json")
      .attachment("isms-audit.json")
      .send(JSON.stringify(items, null, 2));
  }

  @Get("settings")
  async settings() {
    const settings = await this.prisma.applicationSetting.findMany({
      orderBy: { key: "asc" },
    });
    return settings.map((setting) => {
      const value = setting.value as { protected?: boolean };
      return value?.protected
        ? { ...setting, value: { protected: true } }
        : setting;
    });
  }

  @Put("settings/:key")
  async updateSetting(
    @Req() req: IsmsRequest,
    @Param("key") key: string,
    @Body() value: Record<string, unknown>,
  ) {
    if (!/^[a-z][a-z0-9.-]{1,79}$/.test(key))
      throw new BadRequestException("Invalid setting key");
    const sensitive = /(password|secret|token|credential|bind)/i.test(key);
    const jsonValue = sensitive
      ? ({
          protected: true,
          encrypted: this.crypto.encrypt(JSON.stringify(value)),
        } as Prisma.InputJsonValue)
      : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
    const setting = await this.prisma.applicationSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    });
    await this.audit.record(req, "setting.update", `setting:${key}`, "success");
    return setting;
  }
}

const allowedExtensions: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
};
const canonicalDocumentSlug = (title: string, id: string) => {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${normalized || "document"}-${id.slice(0, 8)}`;
};

const magicMatches = (content: Buffer, extension: string) => {
  if (extension === ".pdf")
    return content.subarray(0, 5).toString() === "%PDF-";
  if ([".docx", ".xlsx"].includes(extension))
    return content[0] === 0x50 && content[1] === 0x4b;
  return false;
};

const watermarkPositions = ["HEADER", "CENTER", "FOOTER"] as const;
const parseWatermarkPosition = (value?: string) => {
  const position = value || "CENTER";
  if (
    !watermarkPositions.includes(
      position as (typeof watermarkPositions)[number],
    )
  )
    throw new BadRequestException("Invalid watermark position");
  return position as (typeof watermarkPositions)[number];
};

@ApiTags("document administration")
@AdminOnly()
@Controller("admin/documents")
export class DocumentAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
    private readonly audit: AuditService,
    private readonly watermark: WatermarkService,
  ) {}

  @Get()
  async list(
    @Query("q") query = "",
    @Query("page") pageValue?: string,
    @Query("limit") limitValue = "50",
    @Query("sort") sort = "updatedAt",
    @Query("order") order: "asc" | "desc" = "desc",
  ) {
    const q = query.trim().slice(0, 200);
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            translations: {
              some: { title: { contains: q, mode: "insensitive" as const } },
            },
          }
        : {}),
    };
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitValue) || 50));
    const orderBy =
      sort === "status"
        ? { status: order }
        : sort === "publishedAt"
          ? { publishedAt: order }
          : { updatedAt: order };
    const options: Prisma.DocumentFindManyArgs = {
      where,
      include: {
        translations: true,
        versions: {
          select: { id: true, locale: true, version: true, createdAt: true },
        },
        category: true,
        space: true,
      },
      orderBy,
      ...(pageValue ? { skip: (page - 1) * limit, take: limit } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.document.findMany(options),
      this.prisma.document.count({ where }),
    ]);
    return pageValue ? { items, page, limit, total } : items;
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: IsmsRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new BadRequestException("A file is required");
    if (!["fr", "en"].includes(body.locale))
      throw new BadRequestException("Locale must be fr or en");
    if (!body.spaceId || !body.title?.trim())
      throw new BadRequestException("spaceId and title are required");
    const sensitive = body.sensitive === "true";
    const watermarkPosition = parseWatermarkPosition(body.watermarkPosition);
    const existing = body.documentId
      ? await this.prisma.document.findFirst({
          where: { id: body.documentId, deletedAt: null },
          select: { id: true, spaceId: true },
        })
      : null;
    if (body.documentId && !existing) throw new NotFoundException();
    if (existing && existing.spaceId !== body.spaceId)
      throw new BadRequestException(
        "A version must remain in its document space",
      );
    const extension = extname(file.originalname).toLowerCase();
    if (
      !allowedExtensions[extension]?.includes(file.mimetype) ||
      !magicMatches(file.buffer, extension)
    ) {
      throw new BadRequestException(
        "File extension, MIME type and content are inconsistent",
      );
    }
    const [space, category] = await Promise.all([
      this.prisma.documentSpace.findFirst({
        where: { id: body.spaceId, deletedAt: null },
      }),
      body.categoryId
        ? this.prisma.documentCategory.findFirst({
            where: {
              id: body.categoryId,
              spaceId: body.spaceId,
              deletedAt: null,
            },
          })
        : Promise.resolve(null),
    ]);
    if (!space || (body.categoryId && !category))
      throw new BadRequestException("Invalid space or category");
    const scan = await this.antivirus.scan(file.buffer);
    const documentId = existing?.id || randomUUID();
    const objectKey = `${scan.status === "CLEAN" ? "documents" : "quarantine"}/${documentId}/${body.locale}/${randomUUID()}${extension}`;
    await this.storage.putObject(objectKey, file.buffer, {
      "Content-Type": file.mimetype,
      "X-Amz-Meta-Sha256": createHash("sha256")
        .update(file.buffer)
        .digest("hex"),
    });
    const result = await this.prisma.$transaction(async (tx) => {
      const document = existing
        ? existing
        : await tx.document.create({
            data: {
              id: documentId,
              slug: canonicalDocumentSlug(body.title.trim(), documentId),
              spaceId: body.spaceId,
              categoryId: body.categoryId || null,
              sensitive,
              watermarkPosition,
              status: scan.status === "CLEAN" ? "DRAFT" : "QUARANTINED",
            },
          });
      if (!document) throw new NotFoundException("Document not found");
      const latest = await tx.documentVersion.findFirst({
        where: { documentId, locale: body.locale },
        orderBy: { version: "desc" },
        include: { storedFile: true },
      });
      const automatedChange = latest
        ? compareDocumentVersions(
            await this.storage.getBuffer(latest.storedFile.objectKey),
            file.buffer,
            extension,
          )
        : {
            details: { added: [], removed: [], modified: [] },
            summary: "Initial version",
          };
      const storedFile = await tx.storedFile.create({
        data: {
          objectKey,
          originalName: basename(file.originalname).replace(/[\r\n]/g, "_"),
          mimeType: file.mimetype,
          size: BigInt(file.size),
          sha256: createHash("sha256").update(file.buffer).digest("hex"),
          scans: {
            create: {
              status: scan.status,
              signature: "signature" in scan ? scan.signature : null,
              scannedAt: new Date(),
            },
          },
        },
      });
      await tx.documentVersion.create({
        data: {
          documentId,
          locale: body.locale,
          version: (latest?.version || 0) + 1,
          storedFileId: storedFile.id,
          changeSummary: body.changeSummary?.trim() || automatedChange.summary,
          changeDetails: automatedChange.details,
        },
      });
      await tx.documentTranslation.upsert({
        where: { documentId_locale: { documentId, locale: body.locale } },
        update: {
          title: body.title.trim(),
          description: body.description?.trim() || null,
        },
        create: {
          documentId,
          locale: body.locale,
          title: body.title.trim(),
          description: body.description?.trim() || null,
        },
      });
      return tx.document.findUnique({
        where: { id: documentId },
        include: { translations: true, versions: true },
      });
    });
    await this.audit.record(
      req,
      "document.upload",
      `document:${documentId}`,
      scan.status === "CLEAN" ? "success" : "failure",
      {
        locale: body.locale,
        scanStatus: scan.status,
        size: file.size,
        sha256: createHash("sha256").update(file.buffer).digest("hex"),
      },
    );
    return result;
  }

  @Post(":id/publish")
  async publish(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: { include: { storedFile: { include: { scans: true } } } },
      },
    });
    if (!document) throw new NotFoundException();
    if (
      document.versions.length === 0 ||
      document.versions.some(
        (version) =>
          !version.storedFile.scans.some((scan) => scan.status === "CLEAN"),
      )
    ) {
      throw new ConflictException(
        "Every document version must pass antivirus scanning",
      );
    }
    const distributedFiles = await this.watermark.prepareForPublication(id);
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await this.audit.record(
      req,
      "document.publish",
      `document:${id}`,
      "success",
      distributedFiles.length ? { distributedFiles } : undefined,
    );
    return updated;
  }

  @Post(":id/archive")
  async archive(@Req() req: IsmsRequest, @Param("id") id: string) {
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    await this.audit.record(
      req,
      "document.archive",
      `document:${id}`,
      "success",
    );
    return updated;
  }

  @Post(":id/restore")
  async restore(@Req() req: IsmsRequest, @Param("id") id: string) {
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: "DRAFT" },
    });
    await this.audit.record(
      req,
      "document.restore",
      `document:${id}`,
      "success",
    );
    return updated;
  }

  @Delete(":id")
  async remove(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        translations: { select: { title: true, locale: true } },
        versions: {
          include: {
            storedFile: { select: { id: true, objectKey: true } },
            distributedStoredFile: {
              select: { id: true, objectKey: true },
            },
          },
        },
      },
    });
    if (!document) throw new NotFoundException();
    const storedFiles = Array.from(
      new Map(
        document.versions.flatMap((version) =>
          [version.storedFile, version.distributedStoredFile]
            .filter((file): file is { id: string; objectKey: string } =>
              Boolean(file),
            )
            .map((file) => [file.id, file] as const),
        ),
      ).values(),
    );
    const storedFileIds = storedFiles.map((file) => file.id);
    await this.prisma.$transaction([
      this.prisma.antivirusScan.deleteMany({
        where: { storedFileId: { in: storedFileIds } },
      }),
      this.prisma.documentVersion.deleteMany({ where: { documentId: id } }),
      this.prisma.documentTranslation.deleteMany({ where: { documentId: id } }),
      this.prisma.document.delete({ where: { id } }),
      this.prisma.storedFile.deleteMany({
        where: {
          id: { in: storedFileIds },
          sourceVersions: { none: {} },
          distributedVersions: { none: {} },
        },
      }),
    ]);
    const cleanupResults = await Promise.allSettled(
      storedFiles.map((file) => this.storage.removeObject(file.objectKey)),
    );
    const storageCleanupFailures = cleanupResults.filter(
      (result) => result.status === "rejected",
    ).length;
    await this.audit.record(
      req,
      "document.delete",
      `document:${id}`,
      storageCleanupFailures === 0 ? "success" : "failure",
      {
        translations: document.translations,
        deletedVersions: document.versions.length,
        storageCleanupFailures,
      },
    );
    return {
      deleted: true,
      deletedVersions: document.versions.length,
      storageCleanupFailures,
    };
  }
}

@ApiTags("directory administration")
@AdminOnly()
@Controller("admin/directory-connections")
export class DirectoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly directory: DirectoryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.directoryConnection.findMany({
      select: {
        id: true,
        name: true,
        domain: true,
        primaryHost: true,
        secondaryHost: true,
        port: true,
        protocol: true,
        baseDn: true,
        userBaseDn: true,
        groupBaseDn: true,
        bindDn: true,
        userFilter: true,
        groupFilter: true,
        loginAttribute: true,
        usernameAttribute: true,
        groupAttribute: true,
        emailAttribute: true,
        nestedGroups: true,
        syncIntervalMinutes: true,
        timeoutMs: true,
        retries: true,
        enabled: true,
        caCertificateId: true,
        lastTestAt: true,
        lastTestStatus: true,
        createdAt: true,
        updatedAt: true,
        syncJobs: {
          orderBy: { startedAt: "desc" as const },
          take: 1,
          select: {
            id: true,
            status: true,
            details: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  @Get("groups/search")
  searchGroups(@Query("q") query = "") {
    return this.directory.searchGroups(query);
  }

  @Post("purge")
  async purge(@Req() req: IsmsRequest) {
    const result = await this.directory.purgeSynchronizedGroups();
    await this.audit.record(
      req,
      "directory.purge",
      "directory-groups:synchronized",
      "success",
      result,
    );
    return result;
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: DirectoryConnectionDto) {
    if (!body.bindSecret)
      throw new BadRequestException("bindSecret is required");
    try {
      validateDirectoryHosts(
        body.protocol,
        body.primaryHost,
        body.secondaryHost,
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (body.protocol === "LDAPS" && !body.caCertificateId)
      throw new BadRequestException("LDAPS requires a CA certificate");
    const connection = await this.prisma.directoryConnection.create({
      data: {
        name: body.name,
        domain: body.domain,
        primaryHost: body.primaryHost,
        secondaryHost: body.secondaryHost || null,
        port: body.port,
        protocol: body.protocol,
        baseDn: body.baseDn,
        userBaseDn: body.userBaseDn || null,
        groupBaseDn: body.groupBaseDn || null,
        bindDn: body.bindDn,
        userFilter: body.userFilter,
        groupFilter: body.groupFilter,
        loginAttribute: body.loginAttribute,
        usernameAttribute: body.usernameAttribute,
        groupAttribute: body.groupAttribute,
        emailAttribute: body.emailAttribute,
        nestedGroups: body.nestedGroups,
        syncIntervalMinutes: body.syncIntervalMinutes,
        timeoutMs: body.timeoutMs,
        retries: body.retries,
        enabled: body.enabled,
        caCertificateId: body.caCertificateId || null,
        encryptedBindSecret: this.crypto.encrypt(body.bindSecret),
      },
      select: {
        id: true,
        name: true,
        protocol: true,
        primaryHost: true,
        enabled: true,
      },
    });
    await this.audit.record(
      req,
      "directory.create",
      `directory:${connection.id}`,
      "success",
      { name: connection.name, protocol: connection.protocol },
    );
    return connection;
  }

  @Put(":id")
  async update(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: DirectoryConnectionDto,
  ) {
    const existing = await this.prisma.directoryConnection.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    try {
      validateDirectoryHosts(
        body.protocol,
        body.primaryHost,
        body.secondaryHost,
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (body.protocol === "LDAPS" && !body.caCertificateId)
      throw new BadRequestException("LDAPS requires a CA certificate");
    const connection = await this.prisma.directoryConnection.update({
      where: { id },
      data: {
        name: body.name,
        domain: body.domain,
        primaryHost: body.primaryHost,
        secondaryHost: body.secondaryHost || null,
        port: body.port,
        protocol: body.protocol,
        baseDn: body.baseDn,
        userBaseDn: body.userBaseDn || null,
        groupBaseDn: body.groupBaseDn || null,
        bindDn: body.bindDn,
        userFilter: body.userFilter,
        groupFilter: body.groupFilter,
        loginAttribute: body.loginAttribute,
        usernameAttribute: body.usernameAttribute,
        groupAttribute: body.groupAttribute,
        emailAttribute: body.emailAttribute,
        nestedGroups: body.nestedGroups,
        syncIntervalMinutes: body.syncIntervalMinutes,
        timeoutMs: body.timeoutMs,
        retries: body.retries,
        enabled: body.enabled,
        caCertificateId: body.caCertificateId || null,
        ...(body.bindSecret
          ? { encryptedBindSecret: this.crypto.encrypt(body.bindSecret) }
          : {}),
      },
      select: {
        id: true,
        name: true,
        protocol: true,
        primaryHost: true,
        enabled: true,
      },
    });
    await this.audit.record(
      req,
      "directory.update",
      `directory:${id}`,
      "success",
      { name: connection.name, protocol: connection.protocol },
    );
    return connection;
  }

  @Delete(":id")
  async remove(@Req() req: IsmsRequest, @Param("id") id: string) {
    const existing = await this.prisma.directoryConnection.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.directoryConnection.update({
      where: { id },
      data: { enabled: false },
    });
    await this.audit.record(
      req,
      "directory.disable",
      `directory:${id}`,
      "success",
    );
    return { disabled: true };
  }

  @Post(":id/test")
  async test(@Req() req: IsmsRequest, @Param("id") id: string) {
    const result = await this.directory.test(id);
    await this.audit.record(
      req,
      "directory.test",
      `directory:${id}`,
      result.status === "SUCCESS" ? "success" : "failure",
      {
        status: result.status,
        durationMs: result.durationMs,
      },
    );
    return result;
  }

  @Post(":id/synchronize")
  async synchronize(@Req() req: IsmsRequest, @Param("id") id: string) {
    const result = await this.directory.synchronize(id);
    await this.audit.record(
      req,
      "directory.sync",
      `directory:${id}`,
      result.status === "SUCCESS" ? "success" : "failure",
      { status: result.status },
    );
    return result;
  }

  @Get(":id/jobs")
  jobs(@Param("id") id: string) {
    return this.prisma.directorySyncJob.findMany({
      where: { connectionId: id },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
  }
}

@ApiTags("certificates")
@AdminOnly()
@Controller("admin/certificates")
export class CertificatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const records = await this.prisma.trustedCaCertificate.findMany({
      select: {
        ...certificateSelection,
        connections: { select: { id: true, name: true, enabled: true } },
      },
      orderBy: { name: "asc" },
    });
    return records.map((record) => ({
      ...record,
      status: certificateStatus(record.validFrom, record.validTo),
      inUse: record.connections.some((connection) => connection.enabled),
    }));
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: ImportCertificateDto) {
    let certificates;
    try {
      certificates = parseCaCertificates(body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const existing = await this.prisma.trustedCaCertificate.findMany({
      select: { fingerprintSha256: true },
    });
    const existingFingerprints = new Set(
      existing.map((certificate) => certificate.fingerprintSha256),
    );
    const uniqueCertificates = certificates.filter((certificate, index) => {
      const fingerprint = createHash("sha256")
        .update(certificate.raw)
        .digest("hex");
      return (
        !existingFingerprints.has(fingerprint) &&
        certificates.findIndex(
          (candidate) =>
            createHash("sha256").update(candidate.raw).digest("hex") ===
            fingerprint,
        ) === index
      );
    });
    if (!uniqueCertificates.length)
      throw new ConflictException("Duplicate certificate");
    if (existing.length + uniqueCertificates.length > 2) {
      throw new ConflictException(
        `The file contains ${uniqueCertificates.length} new CA certificates, but only ${2 - existing.length} slot(s) remain`,
      );
    }

    const records = await this.prisma.$transaction(
      uniqueCertificates.map((certificate, index) => {
        const fingerprintSha256 = createHash("sha256")
          .update(certificate.raw)
          .digest("hex");
        const suffix =
          uniqueCertificates.length > 1
            ? ` (${index + 1}/${uniqueCertificates.length})`
            : "";
        return this.prisma.trustedCaCertificate.create({
          data: {
            id: randomUUID(),
            name: `${body.name.trim()}${suffix}`,
            subject: certificate.subject,
            issuer: certificate.issuer,
            serialNumber: certificate.serialNumber,
            fingerprintSha256,
            validFrom: new Date(certificate.validFrom),
            validTo: new Date(certificate.validTo),
            pem: certificate.toString(),
          },
          select: certificateSelection,
        });
      }),
    );
    await this.audit.record(
      req,
      "certificate.import",
      `certificates:${records.map((record) => record.id).join(",")}`,
      "success",
      {
        count: records.length,
        fingerprintsSha256: records.map((record) => record.fingerprintSha256),
      },
    );
    return records.map((record) => ({
      ...record,
      status: certificateStatus(record.validFrom, record.validTo),
      inUse: false,
    }));
  }

  @Get(":id/public")
  async downloadPublic(@Param("id") id: string, @Res() response: Response) {
    const record = await this.prisma.trustedCaCertificate.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException();
    const safeName = record.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    response
      .type("application/x-pem-file")
      .attachment(`${safeName}.pem`)
      .send(record.pem);
  }

  @Post(":id/test")
  async test(@Req() req: IsmsRequest, @Param("id") id: string) {
    const record = await this.prisma.trustedCaCertificate.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException();
    const status = certificateStatus(record.validFrom, record.validTo);
    await this.audit.record(
      req,
      "certificate.test",
      `certificate:${id}`,
      status === "valid" || status === "expiring-soon" ? "success" : "failure",
      { status },
    );
    return { id, status, validFrom: record.validFrom, validTo: record.validTo };
  }

  @Delete(":id")
  async remove(@Req() req: IsmsRequest, @Param("id") id: string) {
    const record = await this.prisma.trustedCaCertificate.findUnique({
      where: { id },
      include: {
        connections: { select: { id: true, name: true, enabled: true } },
      },
    });
    if (!record) throw new NotFoundException();
    const affectedConnections = record.connections.filter(
      (connection) => connection.enabled,
    );
    await this.prisma.$transaction([
      this.prisma.directoryConnection.updateMany({
        where: { caCertificateId: id },
        data: { enabled: false, caCertificateId: null },
      }),
      this.prisma.trustedCaCertificate.delete({ where: { id } }),
    ]);
    await this.audit.record(
      req,
      "certificate.delete",
      `certificate:${id}`,
      "success",
      {
        fingerprintSha256: record.fingerprintSha256,
        disabledConnections: affectedConnections.map(
          (connection) => connection.id,
        ),
      },
    );
    return { deleted: true, disabledConnections: affectedConnections };
  }
}
