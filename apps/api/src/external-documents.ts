import { BadRequestException, ConflictException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { ExternalDocumentDto } from "./admin.dto";
import type { AuditService } from "./audit.service";
import type { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { validateArticleUrl } from "./articles.controller";
import { validateBrandingLogo } from "./branding.controller";
import { supportedLanguages } from "./language-settings";
import { assertCanMarkSensitive, normalizeIdentity } from "./sensitive-sharing";
import { canonicalDocumentSlug } from "./document-slug";

export async function createExternalDocument(
  prisma: PrismaService,
  audit: AuditService,
  req: IsmsRequest,
  body: ExternalDocumentDto,
) {
  if (!(supportedLanguages as readonly string[]).includes(body.locale))
    throw new BadRequestException("Unsupported document language");
  const title = body.title.trim();
  if (!title) throw new BadRequestException("A title is required");
  if (body.sensitive) await assertCanMarkSensitive(prisma, req);
  const externalUrl = validateArticleUrl(body.url);
  const thumbnail = validateBrandingLogo(body.thumbnail, "thumbnail");
  const [space, category] = await Promise.all([
    prisma.documentSpace.findFirst({
      where: { id: body.spaceId, deletedAt: null },
    }),
    body.categoryId
      ? prisma.documentCategory.findFirst({
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
  if (
    await prisma.document.findFirst({
      where: { spaceId: body.spaceId, externalUrl, deletedAt: null },
      select: { id: true },
    })
  )
    throw new ConflictException("This link already exists in this space");
  const id = randomUUID();
  const document = await prisma.document.create({
    data: {
      id,
      slug: canonicalDocumentSlug(title, id),
      spaceId: body.spaceId,
      categoryId: body.categoryId || null,
      externalUrl,
      thumbnail,
      sensitive: body.sensitive === true,
      suppressEmailNotifications: body.suppressEmailNotifications === true,
      translations: {
        create: {
          locale: body.locale,
          title,
          description: body.description?.trim() || null,
        },
      },
      ...(body.sensitive
        ? {
            sensitiveShares: {
              create: {
                recipient: normalizeIdentity(req.identity.username),
                createdBy: req.identity.username,
                expiresAt: null,
              },
            },
          }
        : {}),
    },
    include: { translations: true, versions: true },
  });
  await audit.record(
    req,
    "document.external.create",
    `document:${id}`,
    "success",
    { locale: body.locale, host: new URL(externalUrl).host },
    { notify: !document.suppressEmailNotifications },
  );
  return document;
}
