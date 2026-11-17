import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  metadataWhere,
  normalizeMetadataSearch,
  resolvedMetadataWhere,
  mergeMetadata,
  readReminderSettings,
  rejectDuplicate,
} from "./document-management";
import { DocumentManagementController } from "./document-management.controller";
import type { PrismaService } from "./prisma.service";
import type { AuthorizationService } from "./authorization.service";
import type { AuditService } from "./audit.service";
import type { IsmsRequest } from "./types";

const documentId = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-31T10:00:00.000Z";
const req = {
  identity: { username: "editor@example.com", groups: [] },
  ip: "127.0.0.1",
  correlationId: "test",
} as unknown as IsmsRequest;
function fixture() {
  const document = {
    id: documentId,
    spaceId: "space",
    categoryId: null,
    updatedAt: new Date(at),
    metadata: { retained: "keep", "ged.owner": "Alice" },
    translations: [{ title: "Policy" }],
  };
  const prisma = {
    document: {
      findMany: vi.fn().mockResolvedValue([document]),
      findFirst: vi.fn().mockResolvedValue(document),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
    },
    documentCategory: {
      findFirst: vi.fn().mockResolvedValue({ spaceId: "space" }),
    },
    auditEvent: {
      create: vi
        .fn()
        .mockResolvedValue({ id: "audit", action: "document.metadata.bulk" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    documentReview: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  const authorization = {
    can: vi.fn().mockResolvedValue(true),
    permittedSpaces: vi
      .fn()
      .mockResolvedValue([
        { id: "space", aclRoot: false, aclCategories: ["allowed-category"] },
      ]),
  };
  const audit = { committed: vi.fn() };
  return {
    prisma,
    authorization,
    audit,
    controller: new DocumentManagementController(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
      audit as unknown as AuditService,
    ),
  };
}

describe("optional GED metadata management", () => {
  it("allows empty optional metadata and preserves unrelated fields when merging", () => {
    expect(mergeMetadata(null, {})).toEqual({});
    expect(mergeMetadata({ legacy: "keep" }, { "ged.owner": "Alice" })).toEqual(
      { legacy: "keep", "ged.owner": "Alice" },
    );
  });
  it.each([
    { "ged.reviewDate": "2026-02-30" },
    { "ged.documentType": "unsupported" },
    JSON.parse('{"__proto__":"forbidden"}'),
    { secret: 42 },
    Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`field${i}`, "text"]),
    ),
  ])("rejects invalid merged metadata", (patch) =>
    expect(() =>
      mergeMetadata(null, patch as Record<string, string>),
    ).toThrow(),
  );
  it("builds AND filters without overwriting category ACL predicates", () => {
    const filters = metadataWhere({
      owner: "Alice",
      reference: "SEC",
      reviewFrom: "2026-01-01",
      reviewTo: "2026-12-31",
    });
    expect(filters).toHaveLength(4);
    expect(filters[0]).toEqual({
      metadata: { path: ["ged.reference"], string_contains: "SEC" },
    });
  });
  it.each([
    { reviewFrom: "2026-02-30" },
    { reviewFrom: "2026-12-01", reviewTo: "2026-01-01" },
    { documentType: "<script>" },
    { owner: "a".repeat(201) },
  ])("rejects invalid search filters", (filters) =>
    expect(() => metadataWhere(filters)).toThrow(),
  );
  it("preserves default reminders and bounds invalid stored settings", () => {
    expect(readReminderSettings(null)).toEqual({
      enabled: true,
      leadDays: 30,
      overdueDays: 7,
      publicationRepeatDays: 0,
    });
    expect(
      readReminderSettings({
        enabled: false,
        leadDays: -1,
        overdueDays: 8,
        publicationRepeatDays: 14,
      }),
    ).toEqual({
      enabled: false,
      leadDays: 30,
      overdueDays: 8,
      publicationRepeatDays: 14,
    });
  });
  it("detects only duplicates within the supplied ACL scope", async () => {
    const { prisma } = fixture();
    prisma.document.findFirst.mockResolvedValueOnce(null as never);
    const scope = { categoryId: "allowed" };
    await expect(
      rejectDuplicate(prisma as unknown as PrismaService, "hash", scope),
    ).resolves.toBeUndefined();
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [scope],
          deletedAt: null,
          versions: { some: { storedFile: { sha256: "hash" } } },
        }),
      }),
    );
    await expect(
      rejectDuplicate(prisma as unknown as PrismaService, "hash", scope),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "DOCUMENT_DUPLICATE",
        documentId,
      }),
    });
  });
  it("previews merged values without changing the document", async () => {
    const { controller, prisma } = fixture();
    const result = await controller.preview(req, {
      documents: [{ id: documentId }],
      metadata: { "ged.owner": "Bob" },
    });
    expect(result[0]).toMatchObject({
      expectedUpdatedAt: at,
      metadataBefore: { "ged.owner": "Alice" },
      metadataAfter: { retained: "keep", "ged.owner": "Bob" },
      fields: ["ged.owner"],
    });
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
  it("rejects duplicate selections", async () => {
    const { controller } = fixture();
    await expect(
      controller.preview(req, {
        documents: [{ id: documentId }, { id: documentId }],
        metadata: { "ged.owner": "Bob" },
      }),
    ).rejects.toThrow();
  });
  it("denies a batch when one selected document cannot be edited", async () => {
    const { controller, authorization, prisma } = fixture();
    authorization.can.mockResolvedValueOnce(false);
    await expect(
      controller.apply(req, {
        documents: [{ id: documentId, expectedUpdatedAt: at }],
        metadata: { "ged.owner": "Bob" },
      }),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("checks destination ACLs before moving a document", async () => {
    const { controller, authorization } = fixture();
    authorization.can.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      controller.preview(req, {
        documents: [{ id: documentId }],
        categoryId: "destination",
      }),
    ).rejects.toThrow();
  });
  it("requires preview timestamps before applying", async () => {
    const { controller, prisma } = fixture();
    await expect(
      controller.apply(req, {
        documents: [
          { id: documentId, expectedUpdatedAt: "2025-01-01T00:00:00.000Z" },
        ],
        metadata: { "ged.owner": "Bob" },
      }),
    ).rejects.toThrow(/changed/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("records audit and document changes in the same transaction without copying values into audit", async () => {
    const { controller, prisma, audit } = fixture();
    await expect(
      controller.apply(req, {
        documents: [{ id: documentId, expectedUpdatedAt: at }],
        metadata: { "ged.owner": "Bob" },
      }),
    ).resolves.toEqual({ updated: 1 });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { fields: ["ged.owner"], categoryChanged: false },
        }),
      }),
    );
    expect(audit.committed).toHaveBeenCalledOnce();
  });
  it("does not audit a concurrent update failure", async () => {
    const { controller, prisma, audit } = fixture();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      controller.apply(req, {
        documents: [{ id: documentId, expectedUpdatedAt: at }],
        metadata: { "ged.owner": "Bob" },
      }),
    ).rejects.toThrow(/changed/);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(audit.committed).not.toHaveBeenCalled();
  });
  it("does not reveal history to a non-editor", async () => {
    const { controller, prisma, authorization } = fixture();
    authorization.can.mockResolvedValueOnce(false);
    await expect(controller.history(req, documentId)).rejects.toThrow();
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });
  it("returns only safe history fields", async () => {
    const { controller, prisma } = fixture();
    prisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: "audit",
        occurredAt: new Date(at),
        identity: "editor@example.com",
        action: "document.metadata.update",
        details: {
          fields: ["title"],
          metadataFields: { modified: ["ged.owner"] },
          internal: "not returned",
        },
      },
    ] as never);
    const result = await controller.history(req, documentId);
    expect(result.items[0]).toEqual({
      id: "audit",
      at: new Date(at),
      actor: "editor@example.com",
      action: "document.metadata.update",
      fields: ["title", "ged.owner"],
    });
  });
  it("folds accents, case and ligatures without SQL wildcard semantics", async () => {
    expect(normalizeMetadataSearch("ÉQUIPE Œuvre Æther")).toBe(
      "equipe oeuvre aether",
    );
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: documentId }]),
    };
    expect(
      await resolvedMetadataWhere(prisma as never, {
        owner: "ÉQUIPE%_'",
        reviewFrom: "2026-01-01",
      }),
    ).toEqual([
      { metadata: { path: ["ged.reviewDate"], gte: "2026-01-01" } },
      { id: { in: [documentId] } },
    ]);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toContain("equipe%_'");
    expect(query.sql).toContain("strpos");
    expect(query.sql).not.toContain("equipe%_'");
    await expect(
      resolvedMetadataWhere(prisma as never, { reviewTo: "2026-02-30" }),
    ).rejects.toThrow();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
  it("keeps the newer metadata when two moderators save the same revision", async () => {
    const { controller, prisma } = fixture();
    let revision = at,
      owner = "Alice";
    prisma.document.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.updatedAt.toISOString() !== revision) return { count: 0 };
      revision = data.updatedAt.toISOString();
      owner = data.metadata["ged.owner"];
      return { count: 1 };
    });
    const requests = ["Bob", "Carol"].map((name) =>
      controller.apply(
        {
          ...req,
          identity: { ...req.identity, username: `${name}@example.test` },
        },
        {
          documents: [{ id: documentId, expectedUpdatedAt: at }],
          metadata: { "ged.owner": name },
        },
      ),
    );
    const results = await Promise.allSettled(requests);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(owner).toBe("Bob");
    expect(prisma.auditEvent.create).toHaveBeenCalledOnce();
  });
  it("diagnoses only scoped records and does not fetch external links", async () => {
    const { controller, prisma } = fixture();
    prisma.document.count.mockResolvedValue(3);
    prisma.document.findMany.mockResolvedValue([
      {
        id: "1",
        metadata: { "ged.reference": "RÉF-1" },
        externalUrl: "https://example.test",
      },
      {
        id: "2",
        metadata: { "ged.reference": "ref-1" },
        externalUrl: "http://127.0.0.1",
      },
      {
        id: "3",
        metadata: { "ged.reviewDate": "2026-02-30" },
        externalUrl: null,
      },
    ] as never);
    expect(await controller.quality(req)).toMatchObject({
      duplicateReferences: 2,
      invalidMetadata: 1,
      invalidLinks: 1,
      examined: 3,
      remaining: 0,
    });
    expect(
      prisma.document.findMany.mock.calls[0][0].where.AND[0].OR[0],
    ).toMatchObject({ spaceId: "space" });
  });
  it("counts quality only inside the editor's category scopes", async () => {
    const { controller, prisma } = fixture();
    await controller.quality(req);
    expect(
      prisma.document.count.mock.calls[0][0].where.AND[0].OR[0],
    ).toMatchObject({
      spaceId: "space",
      OR: [{ categoryId: { in: ["allowed-category"] } }],
    });
  });
});
