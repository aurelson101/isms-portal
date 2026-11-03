import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma.service";
import type { StorageService } from "./storage.service";
import type { IsmsRequest } from "./types";
import { extractDocumentText } from "./document-diff";
import { OcrUnavailableError, ocrPdf } from "./ocr";
import { requestTimestamp, timestampAuthorityUrl } from "./timestamp";
import { persistAudit } from "./audit-event";

const MAX_TEXT = 1_000_000;
// Below this many characters per page a PDF is treated as scanned.
const SCANNED_CHARS_PER_PAGE = 40;

const schedulerRequest = () =>
  ({
    identity: {
      username: "ISMS scheduler",
      displayName: "ISMS scheduler",
      groups: [],
      source: "system",
    },
    ip: "worker",
    correlationId: randomUUID(),
  }) as unknown as IsmsRequest;

const isProtected = (objectKey: string) => /(^|\/)mip-/u.test(objectKey);

/** Queues versions without content rows, then extracts text (OCR if scanned). */
export async function indexDocumentContents(
  prisma: PrismaService,
  storage: StorageService,
  limit = Number(process.env.CONTENT_INDEX_BATCH || 5),
) {
  await prisma.$executeRaw`
    INSERT INTO "DocumentVersionContent" ("versionId", "status", "createdAt", "updatedAt")
    SELECT version.id, 'PENDING', now(), now()
    FROM "DocumentVersion" version
    LEFT JOIN "DocumentVersionContent" content ON content."versionId" = version.id
    WHERE content."versionId" IS NULL
    ORDER BY version."createdAt" DESC
    LIMIT 500
    ON CONFLICT DO NOTHING`;
  // A crashed worker leaves PROCESSING rows; give them another attempt.
  await prisma.documentVersionContent.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(Date.now() - 30 * 60_000) },
    },
    data: { status: "PENDING" },
  });
  const pending = await prisma.documentVersionContent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { versionId: true },
    take: limit,
  });
  let indexed = 0;
  for (const { versionId } of pending) {
    const claimed = await prisma.documentVersionContent.updateMany({
      where: { versionId, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: {
        storedFile: {
          include: { scans: { orderBy: { scannedAt: "desc" }, take: 1 } },
        },
      },
    });
    const file = version?.storedFile;
    if (
      !file ||
      file.purgedAt ||
      isProtected(file.objectKey) ||
      file.scans[0]?.status !== "CLEAN"
    ) {
      await prisma.documentVersionContent.update({
        where: { versionId },
        data: { status: "SKIPPED", extractedAt: new Date() },
      });
      continue;
    }
    try {
      const extension = extname(file.originalName).toLowerCase();
      const buffer = await storage.getBuffer(file.objectKey);
      const extracted = await extractDocumentText(buffer, extension);
      let text = extracted.text;
      const pages = extracted.pages;
      let ocr = false;
      let error: string | null = null;
      if (
        extension === ".pdf" &&
        text.length < Math.max(1, pages) * SCANNED_CHARS_PER_PAGE
      ) {
        try {
          const recognised = (await ocrPdf(buffer))
            .split("\n")
            .map((line) => line.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join("\n");
          if (recognised.length > text.length) {
            text = recognised;
            ocr = true;
          }
        } catch (ocrError) {
          error =
            ocrError instanceof OcrUnavailableError
              ? "OCR unavailable"
              : `OCR failed: ${(ocrError as Error).message.slice(0, 200)}`;
        }
      }
      await prisma.documentVersionContent.update({
        where: { versionId },
        data: {
          status: "DONE",
          text: text.slice(0, MAX_TEXT),
          ocr,
          error,
          extractedAt: new Date(),
        },
      });
      indexed++;
    } catch (failure) {
      const row = await prisma.documentVersionContent.findUnique({
        where: { versionId },
        select: { attempts: true },
      });
      await prisma.documentVersionContent.update({
        where: { versionId },
        data: {
          status: (row?.attempts ?? 3) >= 3 ? "FAILED" : "PENDING",
          error: (failure as Error).message.slice(0, 500),
        },
      });
    }
  }
  return indexed;
}

/** Requests RFC 3161 tokens for stored files when a TSA is configured. */
export async function timestampStoredFiles(prisma: PrismaService, limit = 20) {
  if (!timestampAuthorityUrl()) return 0;
  const files = await prisma.storedFile.findMany({
    where: { timestamp: null, purgedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, sha256: true },
    take: limit,
  });
  let stamped = 0;
  for (const file of files) {
    const result = await requestTimestamp(file.sha256);
    if (!result) break;
    await prisma.fileTimestamp.upsert({
      where: { storedFileId: file.id },
      create: {
        storedFileId: file.id,
        sha256: file.sha256,
        token: result.token,
        genTime: result.genTime,
        tsaUrl: result.url,
      },
      update: {},
    });
    stamped++;
  }
  return stamped;
}

/** Marks policies whose retention ended so administrators can request destruction. */
export async function flagDueRetentions(tx: Prisma.TransactionClient) {
  const due = await tx.retentionPolicy.findMany({
    where: {
      legalHold: false,
      destructionStatus: "NONE",
      retentionUntil: { lte: new Date() },
      document: { destroyedAt: null },
    },
    select: { id: true, documentId: true, retentionUntil: true },
    take: 100,
  });
  for (const policy of due) {
    await tx.retentionPolicy.update({
      where: { id: policy.id },
      data: { destructionStatus: "DUE" },
    });
    await persistAudit(
      tx,
      schedulerRequest(),
      "retention.due",
      `retention-policy:${policy.id}`,
      "success",
      { documentId: policy.documentId, retentionUntil: policy.retentionUntil },
      false,
    );
  }
  return due.length;
}

/**
 * Executes destructions approved by a second administrator: removes every
 * stored file, extracted text and collaboration data, keeps a tombstone and
 * writes a destruction record (procès-verbal) in the sealed audit journal.
 */
export async function executeApprovedDestructions(
  prisma: PrismaService,
  storage: StorageService,
) {
  // A destruction interrupted by a crash is retried after 30 minutes.
  await prisma.retentionPolicy.updateMany({
    where: {
      destructionStatus: "DESTROYING",
      updatedAt: { lt: new Date(Date.now() - 30 * 60_000) },
    },
    data: { destructionStatus: "APPROVED" },
  });
  const policies = await prisma.retentionPolicy.findMany({
    where: { destructionStatus: "APPROVED", legalHold: false },
    include: {
      document: {
        include: {
          translations: { select: { locale: true, title: true } },
          space: { select: { nameFr: true } },
          versions: {
            include: { storedFile: true, distributedStoredFile: true },
          },
        },
      },
    },
    take: 10,
  });
  let destroyed = 0;
  for (const policy of policies) {
    const claimed = await prisma.retentionPolicy.updateMany({
      where: { id: policy.id, destructionStatus: "APPROVED", legalHold: false },
      data: { destructionStatus: "DESTROYING" },
    });
    if (claimed.count !== 1) continue;
    const document = policy.document;
    const files = new Map<
      string,
      NonNullable<(typeof document.versions)[number]["distributedStoredFile"]>
    >();
    for (const version of document.versions) {
      files.set(version.storedFile.id, version.storedFile);
      if (version.distributedStoredFile)
        files.set(
          version.distributedStoredFile.id,
          version.distributedStoredFile,
        );
    }
    const shared = await prisma.documentVersion.findMany({
      where: {
        documentId: { not: document.id },
        OR: [
          { storedFileId: { in: [...files.keys()] } },
          { distributedStoredFileId: { in: [...files.keys()] } },
        ],
      },
      select: { storedFileId: true, distributedStoredFileId: true },
    });
    const keep = new Set(
      shared.flatMap((row) => [row.storedFileId, row.distributedStoredFileId]),
    );
    for (const file of files.values())
      if (!keep.has(file.id) && !file.purgedAt)
        await storage.removeObject(file.objectKey);
    const destroyedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.storedFile.updateMany({
        where: { id: { in: [...files.keys()].filter((id) => !keep.has(id)) } },
        data: { purgedAt: destroyedAt },
      });
      await tx.documentVersionContent.deleteMany({
        where: { version: { documentId: document.id } },
      });
      await tx.documentComment.deleteMany({
        where: { documentId: document.id },
      });
      await tx.documentSubscription.deleteMany({
        where: { documentId: document.id },
      });
      await tx.documentLink.deleteMany({
        where: { OR: [{ sourceId: document.id }, { targetId: document.id }] },
      });
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: "ARCHIVED",
          deletedAt: document.deletedAt ?? destroyedAt,
          destroyedAt,
          lockedBy: null,
          lockedAt: null,
          lockExpiresAt: null,
        },
      });
      await tx.retentionPolicy.update({
        where: { id: policy.id },
        data: { destructionStatus: "DESTROYED", destroyedAt },
      });
      await persistAudit(
        tx,
        schedulerRequest(),
        "document.destroyed",
        `document:${document.id}`,
        "success",
        {
          titles: document.translations,
          space: document.space.nameFr,
          reason: policy.reason,
          retentionUntil: policy.retentionUntil,
          requestedBy: policy.requestedBy,
          approvedBy: policy.approvedBy,
          destroyedAt,
          files: [...files.values()].map((file) => ({
            name: file.originalName,
            sha256: file.sha256,
            size: Number(file.size),
            kept: keep.has(file.id),
          })),
        },
        false,
      );
    });
    destroyed++;
  }
  return destroyed;
}
