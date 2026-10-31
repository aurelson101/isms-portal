import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import { persistAudit } from "./audit-event";
import { categoryDocumentWhere } from "./category-permissions";
import { AdminOnly } from "./security";
import { mergeMetadata, readReminderSettings } from "./document-management";
import type { IsmsRequest } from "./types";

class BulkDocument {
  @IsUUID("4") id!: string;
  @IsOptional() @IsDateString() expectedUpdatedAt?: string;
}
class BulkMetadataDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkDocument)
  documents!: BulkDocument[];
  @IsOptional() @IsObject() metadata?: Record<string, string>;
  @IsOptional() @IsUUID("4") categoryId?: string | null;
}
class ReminderSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) @Max(365) leadDays!: number;
  @IsInt() @Min(0) @Max(365) overdueDays!: number;
  @IsInt() @Min(0) @Max(365) publicationRepeatDays!: number;
}

@Controller("documents")
export class DocumentManagementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async bulkPreview(req: IsmsRequest, body: BulkMetadataDto) {
    const ids = body.documents.map((document) => document.id);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("Duplicate document selection");
    if (
      body.categoryId === undefined &&
      !Object.keys(body.metadata || {}).length
    )
      throw new BadRequestException("Select a metadata or category change");
    const documents = await this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        spaceId: true,
        categoryId: true,
        updatedAt: true,
        metadata: true,
        translations: { select: { title: true }, take: 1 },
      },
    });
    if (documents.length !== ids.length) throw new NotFoundException();
    const target = body.categoryId
      ? await this.prisma.documentCategory.findFirst({
          where: { id: body.categoryId, deletedAt: null },
          select: { spaceId: true },
        })
      : null;
    if (body.categoryId && !target)
      throw new BadRequestException("Invalid category");
    const changes = [];
    const permissionCache = new Map<string, Promise<boolean>>();
    const canEdit = (
      spaceId: string,
      categoryId: string | null | undefined,
    ) => {
      const key = `${spaceId}:${categoryId || ""}`;
      if (!permissionCache.has(key))
        permissionCache.set(
          key,
          this.authorization.can(
            req.identity.groups,
            spaceId,
            "edit",
            categoryId ?? null,
          ),
        );
      return permissionCache.get(key)!;
    };
    for (const document of documents) {
      if (!(await canEdit(document.spaceId, document.categoryId)))
        throw new NotFoundException();
      if (
        body.categoryId !== undefined &&
        (!(await canEdit(document.spaceId, body.categoryId)) ||
          (target && target.spaceId !== document.spaceId))
      )
        throw new NotFoundException();
      const metadata = mergeMetadata(document.metadata, body.metadata);
      const previous = document.metadata as Record<string, string> | null;
      const fields = Object.keys(body.metadata || {}).filter(
        (key) => previous?.[key] !== metadata[key],
      );
      changes.push({
        id: document.id,
        title: document.translations[0]?.title || document.id,
        expectedUpdatedAt: document.updatedAt.toISOString(),
        categoryBefore: document.categoryId,
        categoryAfter:
          body.categoryId === undefined ? document.categoryId : body.categoryId,
        metadataBefore: previous,
        metadataAfter: metadata,
        fields,
      });
    }
    return changes;
  }

  @Post("bulk/preview")
  preview(@Req() req: IsmsRequest, @Body() body: BulkMetadataDto) {
    return this.bulkPreview(req, body);
  }

  @Post("bulk/apply")
  async apply(@Req() req: IsmsRequest, @Body() body: BulkMetadataDto) {
    const changes = await this.bulkPreview(req, body);
    if (
      changes.some(
        (change) =>
          body.documents.find((document) => document.id === change.id)
            ?.expectedUpdatedAt !== change.expectedUpdatedAt,
      )
    )
      throw new ConflictException(
        "Document changed; preview the changes again",
      );
    const events = await this.prisma.$transaction(async (tx) => {
      const audits = [];
      for (const change of changes) {
        const updated = await tx.document.updateMany({
          where: {
            id: change.id,
            deletedAt: null,
            updatedAt: new Date(change.expectedUpdatedAt),
          },
          data: {
            metadata: change.metadataAfter,
            categoryId: change.categoryAfter,
            updatedAt: new Date(
              Math.max(Date.now(), Date.parse(change.expectedUpdatedAt) + 1),
            ),
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            "Document changed; preview the changes again",
          );
        audits.push(
          await persistAudit(
            tx,
            req,
            "document.metadata.bulk",
            `document:${change.id}`,
            "success",
            {
              fields: change.fields,
              categoryChanged: change.categoryBefore !== change.categoryAfter,
            },
            false,
          ),
        );
      }
      return audits;
    });
    for (const event of events) await this.audit.committed(event);
    return { updated: changes.length };
  }

  @Get(":id/history")
  async history(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Query("page") pageValue = "1",
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { spaceId: true, categoryId: true },
    });
    // Change history includes staff identities and is restricted to document editors.
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        "edit",
        document.categoryId,
      ))
    )
      throw new NotFoundException();
    const page = Math.min(
      1000000,
      Math.max(1, Math.floor(Number(pageValue) || 1)),
    );
    const where = {
      resource: `document:${id}`,
      result: "success",
      action: {
        in: [
          "document.metadata.update",
          "document.category.update",
          "document.metadata.bulk",
          "document.publish",
          "document.archive",
          "document.restore",
          "document.upload",
          "document.version.upload",
        ],
      },
    };
    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        select: {
          id: true,
          occurredAt: true,
          identity: true,
          action: true,
          details: true,
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return {
      page,
      total,
      items: events.map((event) => {
        const detail = event.details as {
          fields?: string[];
          metadataFields?: Record<string, string[]>;
        } | null;
        return {
          id: event.id,
          at: event.occurredAt,
          actor: event.identity,
          action: event.action,
          fields: [
            ...new Set([
              ...(detail?.fields || []),
              ...Object.values(detail?.metadataFields || {}).flat(),
            ]),
          ].filter((key) => typeof key === "string"),
        };
      }),
    };
  }

  @Get("quality/summary")
  async quality(@Req() req: IsmsRequest) {
    const scopes = await this.authorization.permittedSpaces(
      req.identity.groups,
      "edit",
    );
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      AND: [categoryDocumentWhere(scopes)],
    };
    const missing = (key: string): Prisma.DocumentWhereInput => ({
      OR: [
        { metadata: { path: [key], equals: Prisma.AnyNull } },
        { metadata: { path: [key], equals: "" } },
      ],
    });
    const [total, missingOwner, incomplete, overdueReviews] = await Promise.all(
      [
        this.prisma.document.count({ where }),
        this.prisma.document.count({
          where: { AND: [where, missing("ged.owner")] },
        }),
        this.prisma.document.count({
          where: {
            AND: [
              where,
              {
                OR: [
                  "ged.owner",
                  "ged.reference",
                  "ged.documentType",
                  "ged.keywords",
                  "ged.reviewDate",
                ].map(missing),
              },
            ],
          },
        }),
        this.prisma.documentReview.count({
          where: {
            status: { in: ["PENDING", "IN_REVIEW"] },
            dueAt: { lt: new Date() },
            document: { ...where, status: "PUBLISHED" },
          },
        }),
      ],
    );
    return { total, missingOwner, incomplete, overdueReviews };
  }

  @AdminOnly()
  @Get("quality/reminders")
  async reminders() {
    return readReminderSettings(
      (
        await this.prisma.applicationSetting.findUnique({
          where: { key: "documents.reminders" },
        })
      )?.value,
    );
  }

  @AdminOnly()
  @Put("quality/reminders")
  async saveReminders(
    @Req() req: IsmsRequest,
    @Body() body: ReminderSettingsDto,
  ) {
    const settings = readReminderSettings(body);
    await this.prisma.$transaction(async (tx) => {
      await tx.applicationSetting.upsert({
        where: { key: "documents.reminders" },
        create: { key: "documents.reminders", value: settings },
        update: { value: settings },
      });
      await persistAudit(
        tx,
        req,
        "documents.reminders.update",
        "documents:reminders",
        "success",
        settings,
        false,
      );
    });
    return settings;
  }
}
