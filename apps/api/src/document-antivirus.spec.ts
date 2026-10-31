import { describe, expect, it, vi } from "vitest";
import { PassThrough, Readable } from "node:stream";
import { DocumentAdminController, DocumentsController } from "./controllers";
import type { IsmsRequest } from "./types";
import type { Response } from "express";

const request = {
  identity: { username: "manager@example.test", groups: ["MANAGERS"] },
} as IsmsRequest;

describe("Document antivirus distribution", () => {
  it.each(["INFECTED", "ERROR", "PENDING", undefined])(
    "blocks preview and download with latest scan %s",
    async (status) => {
      const getObject = vi.fn();
      const prepareForPublication = vi.fn();
      const controller = Object.assign(
        Object.create(DocumentsController.prototype) as DocumentsController,
        {
          prisma: {
            document: {
              findFirst: vi.fn().mockResolvedValue({
                id: "doc",
                spaceId: "space",
                status: "PUBLISHED",
                sensitive: true,
                versions: [
                  {
                    id: "version",
                    storedFile: { scans: status ? [{ status }] : [] },
                  },
                ],
              }),
            },
          },
          authorization: { can: vi.fn().mockResolvedValue(true) },
          storage: { getObject },
          watermark: { prepareForPublication },
          audit: { record: vi.fn() },
        },
      );
      await expect(
        controller.preview(request, {} as Response, "doc", "en"),
      ).rejects.toThrow("no clean version");
      await expect(
        controller.download(request, {} as Response, "doc", "en"),
      ).rejects.toThrow("no clean version");
      expect(getObject).not.toHaveBeenCalled();
      expect(prepareForPublication).not.toHaveBeenCalled();
    },
  );

  it("allows a clean file and queries only its newest antivirus result", async () => {
    const file = {
      originalName: "guide.pdf",
      mimeType: "application/pdf",
      size: 7n,
      objectKey: "documents/guide.pdf",
      scans: [{ status: "CLEAN" }],
    };
    const findFirst = vi.fn().mockResolvedValue({
      id: "doc",
      spaceId: "space",
      status: "PUBLISHED",
      sensitive: false,
      versions: [{ id: "version", storedFile: file }],
    });
    const getObject = vi.fn().mockResolvedValue(Readable.from("fixture"));
    const controller = Object.assign(
      Object.create(DocumentsController.prototype) as DocumentsController,
      {
        prisma: {
          document: { findFirst },
          userDocumentActivity: { upsert: vi.fn() },
        },
        authorization: { can: vi.fn().mockResolvedValue(true) },
        storage: { getObject },
        audit: { record: vi.fn() },
      },
    );
    const response = Object.assign(new PassThrough(), { setHeader: vi.fn() });
    await controller.preview(
      request,
      response as unknown as Response,
      "doc",
      "en",
    );
    expect(getObject).toHaveBeenCalledWith(file.objectKey);
    expect(
      findFirst.mock.calls[0][0].select.versions.select.storedFile.include
        .scans,
    ).toEqual({ orderBy: { scannedAt: "desc" }, take: 1 });
    response.destroy();
  });

  describe.each([DocumentsController, DocumentAdminController])(
    "%s version upload",
    (Controller) => {
      it.each(
        ["CLEAN", "INFECTED", "ERROR"].flatMap((status) =>
          [undefined, "", " Updated description "].map((description) => ({
            status,
            description,
          })),
        ),
      )(
        "requires publication after scan $status and preserves description semantics ($description)",
        async ({ status, description }) => {
          const update = vi.fn();
          const findFirst = vi
            .fn()
            .mockResolvedValue({ id: "doc", spaceId: "space" });
          const findVersion = vi.fn().mockResolvedValue({
            id: "previous",
            version: 1,
            storedFile: {
              objectKey: "documents/old.pdf",
              scans: [{ status: "CLEAN" }],
            },
          });
          const getBuffer = vi
            .fn()
            .mockResolvedValue(Buffer.from("%PDF-1.4\nfixture"));
          const prisma = {
            document: {
              findFirst,
              update,
              findUnique: vi.fn().mockResolvedValue({ id: "doc" }),
            },
            documentSpace: {
              findFirst: vi.fn().mockResolvedValue({ id: "space" }),
            },
            documentVersion: { findFirst: findVersion, create: vi.fn() },
            documentTranslation: { upsert: vi.fn() },
            storedFile: { create: vi.fn().mockResolvedValue({ id: "file" }) },
            $transaction: vi.fn(),
          };
          prisma.$transaction.mockImplementation(async (operation) =>
            operation(prisma),
          );
          const controller = Object.assign(
            Object.create(Controller.prototype) as
              | DocumentsController
              | DocumentAdminController,
            {
              prisma,
              authorization: { can: vi.fn().mockResolvedValue(true) },
              antivirus: { scan: vi.fn().mockResolvedValue({ status }) },
              storage: {
                uploadKey: vi.fn(async (key: string) => key),
                putObject: vi.fn(),
                removeObject: vi.fn(),
                getBuffer,
              },
              audit: { record: vi.fn() },
            },
          );
          const buffer = Buffer.from("%PDF-1.4\nfixture");
          await controller.upload(
            request,
            {
              buffer,
              originalname: "guide.pdf",
              mimetype: "application/pdf",
              size: buffer.length,
            } as Express.Multer.File,
            {
              documentId: "doc",
              spaceId: "space",
              locale: "en",
              title: "Guide",
              ...(description !== undefined ? { description } : {}),
            },
          );
          expect(update).toHaveBeenCalledWith({
            where: { id: "doc" },
            data: {
              suppressEmailNotifications: false,
              status: status === "CLEAN" ? "DRAFT" : "QUARANTINED",
            },
          });
          const translation =
            prisma.documentTranslation.upsert.mock.calls[0][0];
          expect(translation.update).toEqual({
            title: "Guide",
            ...(description !== undefined
              ? { description: description.trim() || null }
              : {}),
          });
          expect(translation.create.description).toBe(
            description?.trim() || null,
          );
          if (status !== "CLEAN") expect(getBuffer).not.toHaveBeenCalled();
        },
      );
    },
  );
});
