import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IsmsRequest } from "./types";
import type { PrismaService } from "./prisma.service";
import type { AuthorizationService } from "./authorization.service";
import { DocumentsController } from "./controllers";
import {
  SensitiveController,
  activeShareWhere,
  sendSensitiveMail,
  remindExpiringSensitiveShares,
} from "./sensitive-sharing";
import { visibleDocument } from "./ged.controller";
import { createExternalDocument } from "./external-documents";

const req = {
  identity: {
    username: "reader@example.test",
    displayName: "Reader",
    groups: [],
  },
  correlationId: "test",
} as unknown as IsmsRequest;

afterEach(() => vi.unstubAllEnvs());

function fixture({ shared = false, manager = false } = {}) {
  const document = {
    id: "document",
    slug: "sensitive-guide",
    spaceId: "space",
    categoryId: "category",
    status: "PUBLISHED",
    sensitive: true,
    externalUrl: "https://example.test/private",
    favorites: [],
    versions: [],
    translations: [],
  };
  const prisma = {
    document: {
      findFirst: vi.fn().mockResolvedValue(document),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ suppressEmailNotifications: true }),
    },
    documentSpace: { findFirst: vi.fn().mockResolvedValue({ id: "space" }) },
    sensitiveDepositor: {
      findFirst: vi.fn().mockResolvedValue({ id: "depositor" }),
    },
    sensitiveShare: {
      findFirst: vi.fn().mockResolvedValue(shared ? { id: "share" } : null),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userDocumentActivity: { upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const authorization = {
    can: vi.fn((_groups: string[], _space: string, permission: string) =>
      Promise.resolve(
        ["read", "preview", "download"].includes(permission) || manager,
      ),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const docs = new DocumentsController(
    prisma as unknown as PrismaService,
    authorization as unknown as AuthorizationService,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    {} as never,
  );
  const shares = new SensitiveController(
    prisma as unknown as PrismaService,
    audit as never,
    authorization as unknown as AuthorizationService,
    {} as never,
    {} as never,
  );
  return { prisma, authorization, audit, docs, shares, document };
}

describe("sensitive documents: named access only", () => {
  it("previews at most ten group email recipients without creating shares or sending messages", async () => {
    const f = fixture({ manager: true });
    const emails = Array.from(
      { length: 12 },
      (_, i) => `reader${i}@example.test`,
    );
    const directory = {
      searchGroups: vi.fn().mockResolvedValue([
        {
          name: "Finance",
          distinguishedName: "CN=Finance",
          connectionId: "ldap",
        },
      ]),
      emailsForGroup: vi.fn().mockResolvedValue([...emails, emails[0]]),
    };
    const alerts = { sendPreferredTo: vi.fn() };
    const controller = new SensitiveController(
      f.prisma as never,
      f.audit as never,
      f.authorization as never,
      alerts as never,
      directory as never,
    );
    const preview = await controller.sharePreview(req, "document", {
      recipient: "Finance",
      recipientType: "group",
      duration: "7d",
    });
    expect(preview).toMatchObject({
      recipient: "Finance",
      emailCount: 12,
      recipients: emails.slice(0, 10),
      expiresAt: expect.any(Date),
    });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(alerts.sendPreferredTo).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it("does not expose group addresses to an unauthorized sensitive-document reader", async () => {
    const f = fixture();
    const directory = { searchGroups: vi.fn(), emailsForGroup: vi.fn() };
    const controller = new SensitiveController(
      f.prisma as never,
      f.audit as never,
      f.authorization as never,
      {} as never,
      directory as never,
    );
    await expect(
      controller.sharePreview(req, "document", {
        recipient: "Finance",
        recipientType: "group",
        duration: "7d",
      }),
    ).rejects.toThrow();
    expect(directory.searchGroups).not.toHaveBeenCalled();
    expect(directory.emailsForGroup).not.toHaveBeenCalled();
  });

  it("matches only the caller or their authenticated AD groups, keeping expiry and revocation", () => {
    const now = new Date();
    expect(
      activeShareWhere("Reader@Example.test", now, ["Finance Readers"]),
    ).toEqual({
      recipient: { in: ["reader@example.test", "ad-group:finance readers"] },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
    expect(activeShareWhere("reader@example.test", now).recipient).toBe(
      "reader@example.test",
    );
  });

  it("propagates authenticated group membership to direct and metadata access checks", async () => {
    const f = fixture({ shared: true });
    const member = {
      ...req,
      identity: { ...req.identity, groups: ["Finance Readers"] },
    };
    await f.docs.one(member, "document");
    expect(f.prisma.sensitiveShare.findFirst).toHaveBeenCalledWith({
      where: {
        documentId: "document",
        ...activeShareWhere(
          member.identity.username,
          expect.any(Date),
          member.identity.groups,
        ),
      },
      select: { id: true },
    });
    await visibleDocument(
      f.prisma as unknown as PrismaService,
      f.authorization as unknown as AuthorizationService,
      member,
      "document",
    );
    expect(f.prisma.sensitiveShare.findFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown and ambiguous AD groups before storing a share", async () => {
    for (const matches of [[], [{ name: "Finance" }, { name: "Finance" }]]) {
      const f = fixture({ manager: true });
      const directory = { searchGroups: vi.fn().mockResolvedValue(matches) };
      const controller = new SensitiveController(
        f.prisma as never,
        f.audit as never,
        f.authorization as never,
        {} as never,
        directory as never,
      );
      await expect(
        controller.share(req, "document", {
          recipient: "Finance",
          recipientType: "group",
          duration: "7d",
        }),
      ).rejects.toThrow("unambiguous");
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it("stores a validated group as one revocable share without granting individual lifetime access", async () => {
    vi.stubEnv("PUBLIC_URL", "https://portal.example.test");
    const f = fixture({ manager: true });
    const create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "group-share",
        createdAt: new Date(),
        revokedAt: null,
        ...data,
      }),
    );
    f.prisma.$transaction = vi.fn(
      async (
        callback: (tx: {
          sensitiveShare: {
            updateMany: typeof f.prisma.sensitiveShare.updateMany;
            create: typeof create;
          };
        }) => Promise<unknown>,
      ) =>
        callback({
          sensitiveShare: {
            updateMany: f.prisma.sensitiveShare.updateMany,
            create,
          },
        }),
    ) as never;
    const directory = {
      searchGroups: vi.fn().mockResolvedValue([
        {
          name: "Finance Readers",
          distinguishedName: "CN=Finance Readers,DC=example,DC=test",
          connectionId: "ldap",
        },
      ]),
      emailsForGroup: vi.fn().mockResolvedValue([]),
    };
    const controller = new SensitiveController(
      f.prisma as never,
      f.audit as never,
      f.authorization as never,
      {} as never,
      directory as never,
    );
    const result = await controller.share(req, "document", {
      recipient: "Finance Readers",
      recipientType: "group",
      duration: "7d",
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient: "ad-group:finance readers",
        expiresAt: expect.any(Date),
      }),
    });
    expect(result).toMatchObject({
      recipient: "finance readers",
      recipientType: "group",
      emailSent: false,
    });
    await expect(
      controller.share(req, "document", {
        recipient: "ad-group:finance readers",
        duration: "7d",
      }),
    ).rejects.toThrow("Invalid recipient");
  });

  it("notifies AD group members individually without disclosing their addresses", async () => {
    const directory = {
      searchGroups: vi.fn().mockResolvedValue([
        {
          name: "Finance",
          distinguishedName: "CN=Finance,DC=example,DC=test",
          connectionId: "ldap",
        },
      ]),
      emailsForGroup: vi
        .fn()
        .mockResolvedValue(["first@example.test", "second@example.test"]),
    };
    const alerts = { sendPreferredTo: vi.fn().mockResolvedValue(undefined) };
    expect(
      await sendSensitiveMail(
        alerts as never,
        directory as never,
        "ad-group:finance",
        "subject",
        "body",
        "https://portal.example.test",
      ),
    ).toBe(true);
    expect(alerts.sendPreferredTo.mock.calls.map((call) => call[0])).toEqual([
      ["first@example.test"],
      ["second@example.test"],
    ]);
  });

  it("filters sensitive titles and search results in the database before pagination", async () => {
    const f = fixture();
    const readable = [{ id: "space", slug: "general" }];
    Object.assign(f.authorization, {
      permittedSpacesFor: vi
        .fn()
        .mockResolvedValue(
          new Map(
            [
              "read",
              "preview",
              "download",
              "upload",
              "edit",
              "publish",
              "archive",
            ].map((permission) => [
              permission,
              ["read", "preview", "download"].includes(permission)
                ? readable
                : [],
            ]),
          ),
        ),
    });
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    Object.assign(f.prisma.document, { count, findMany });
    await f.docs.list(req);
    const where = count.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { sensitive: false },
            {
              sensitive: true,
              status: "PUBLISHED",
              sensitiveShares: {
                some: {
                  recipient: req.identity.username,
                  revokedAt: null,
                  OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: expect.any(Date) } },
                  ],
                },
              },
            },
          ]),
        }),
      ]),
    );
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it("rejects an ordinary space reader without a named share", async () => {
    const f = fixture();
    await expect(f.docs.one(req, "document")).rejects.toThrow();
    expect(f.prisma.userDocumentActivity.upsert).not.toHaveBeenCalled();
  });

  it("gives a named reader preview only, even when the space permits downloads", async () => {
    const f = fixture({ shared: true });
    const result = await f.docs.one(req, "document");
    expect(result.permissions).toMatchObject({
      preview: true,
      download: false,
      edit: false,
      publish: false,
      archive: false,
    });
    expect(result.externalUrl).toBe(f.document.externalUrl);
    await expect(
      f.docs.download(req, {} as never, "document", "en"),
    ).rejects.toThrow();
  });

  it("preserves authorized management access without a named share", async () => {
    const f = fixture({ manager: true });
    await expect(f.docs.one(req, "document")).resolves.toMatchObject({
      id: "document",
    });
    expect(f.prisma.sensitiveShare.findFirst).not.toHaveBeenCalled();
    expect(f.authorization.can).toHaveBeenCalledWith(
      [],
      "space",
      "edit",
      "category",
    );
  });

  it("checks revocation and expiry on every access instead of trusting space ACLs", async () => {
    const f = fixture({ shared: true });
    await expect(f.docs.one(req, "document")).resolves.toMatchObject({
      id: "document",
    });
    f.prisma.sensitiveShare.findFirst.mockResolvedValue(null);
    await expect(f.docs.one(req, "document")).rejects.toThrow();
    expect(f.prisma.sensitiveShare.findFirst).toHaveBeenLastCalledWith({
      where: {
        documentId: "document",
        ...activeShareWhere(req.identity.username, expect.any(Date)),
      },
      select: { id: true },
    });
  });

  it("also protects GED metadata, comments, links and signatures", async () => {
    const f = fixture();
    await expect(
      visibleDocument(
        f.prisma as unknown as PrismaService,
        f.authorization as unknown as AuthorizationService,
        req,
        "document",
      ),
    ).resolves.toBeNull();
    f.prisma.sensitiveShare.findFirst.mockResolvedValue({ id: "share" });
    await expect(
      visibleDocument(
        f.prisma as unknown as PrismaService,
        f.authorization as unknown as AuthorizationService,
        req,
        "document",
      ),
    ).resolves.toMatchObject({ id: "document" });
  });

  it("does not let a designated depositor revoke another document's share by ID", async () => {
    const f = fixture();
    f.prisma.sensitiveShare.findUnique.mockResolvedValue({
      id: "share",
      documentId: "document",
      createdBy: "another@example.test",
    });
    await expect(f.shares.revoke(req, "share")).rejects.toThrow();
    expect(f.prisma.sensitiveShare.updateMany).not.toHaveBeenCalled();
  });

  it("allows a depositor to revoke their own share even after losing document access", async () => {
    const f = fixture();
    f.prisma.sensitiveShare.findUnique.mockResolvedValue({
      id: "share",
      documentId: "document",
      createdBy: req.identity.username,
    });
    await expect(f.shares.revoke(req, "share")).resolves.toEqual({
      revoked: true,
    });
  });

  it("releases a reminder claim if delivery fails, allowing a later retry", async () => {
    vi.stubEnv("PUBLIC_URL", "https://portal.example.test");
    const f = fixture();
    f.prisma.sensitiveShare.findMany.mockResolvedValue([
      {
        id: "share",
        recipient: "reader@example.test",
        expiresAt: new Date(Date.now() + 86400000),
        document: { slug: "guide", translations: [{ title: "Guide" }] },
      },
    ]);
    const alerts = {
      sendPreferredTo: vi.fn().mockRejectedValue(new Error("Mail unavailable")),
    };
    await expect(
      remindExpiringSensitiveShares(
        f.prisma as unknown as PrismaService,
        alerts as never,
        {} as never,
      ),
    ).resolves.toBe(0);
    expect(f.prisma.sensitiveShare.updateMany).toHaveBeenLastCalledWith({
      where: { id: "share", reminderSentAt: expect.any(Date) },
      data: { reminderSentAt: null },
    });
  });
});

describe("external document creation", () => {
  const body = {
    spaceId: "space",
    locale: "en",
    title: "Training",
    url: "https://example.test/training",
  };
  it("requires upload access on the requested space and category", async () => {
    const f = fixture();
    f.authorization.can.mockResolvedValue(false);
    await expect(f.docs.createExternal(req, body)).rejects.toThrow();
    expect(f.prisma.document.create).not.toHaveBeenCalled();
  });
  it("creates a sensitive linked document and grants its author named access atomically", async () => {
    const f = fixture();
    f.prisma.document.findFirst.mockResolvedValue(null);
    await createExternalDocument(
      f.prisma as unknown as PrismaService,
      f.audit as never,
      req,
      { ...body, sensitive: true, suppressEmailNotifications: true },
    );
    expect(f.prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sensitive: true,
          externalUrl: body.url,
          sensitiveShares: {
            create: {
              recipient: req.identity.username,
              createdBy: req.identity.username,
              expiresAt: null,
            },
          },
        }),
      }),
    );
    expect(f.audit.record).toHaveBeenCalledWith(
      req,
      "document.external.create",
      expect.any(String),
      "success",
      expect.any(Object),
      { notify: false },
    );
  });
  it("rejects whitespace-only titles and executable URLs", async () => {
    const f = fixture();
    await expect(
      createExternalDocument(
        f.prisma as unknown as PrismaService,
        f.audit as never,
        req,
        { ...body, title: " " },
      ),
    ).rejects.toThrow();
    await expect(
      createExternalDocument(
        f.prisma as unknown as PrismaService,
        f.audit as never,
        req,
        { ...body, url: "javascript:alert(1)" },
      ),
    ).rejects.toThrow();
    expect(f.prisma.document.create).not.toHaveBeenCalled();
  });
});
