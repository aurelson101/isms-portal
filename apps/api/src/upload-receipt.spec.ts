import { expect, it, vi } from "vitest";
import { findUploadReceipt, uploadReceipt } from "./upload-receipt";
import type { PrismaService } from "./prisma.service";
import { DocumentAdminController, DocumentsController } from "./controllers";

const body = {
  uploadRequestId: "00000000-0000-4000-8000-000000000001",
  title: "Guide",
  spaceId: "space",
  locale: "en",
};
const file = {
  originalname: "guide.pdf",
  mimetype: "application/pdf",
  buffer: Buffer.from("%PDF-1.7"),
} as Express.Multer.File;

it("binds retry IDs to the uploader and the fingerprint to the full payload", () => {
  const receipt = uploadReceipt("alice", body, file)!;
  expect(uploadReceipt("ALICE", body, file)).toEqual(receipt);
  expect(uploadReceipt("bob", body, file)?.id).not.toBe(receipt.id);
  expect(
    uploadReceipt("alice", { ...body, title: "Changed" }, file),
  ).toMatchObject({ id: receipt.id });
  expect(
    uploadReceipt("alice", { ...body, title: "Changed" }, file)?.fingerprint,
  ).not.toBe(receipt.fingerprint);
  expect(
    uploadReceipt("alice", body, { ...file, buffer: Buffer.from("Different") })
      ?.fingerprint,
  ).not.toBe(receipt.fingerprint);
  expect(() =>
    uploadReceipt("alice", { ...body, uploadRequestId: "invalid" }, file),
  ).toThrow("Invalid upload");
});

it("recovers a completed upload from persisted data and refuses altered or deleted documents", async () => {
  const receipt = uploadReceipt("alice", body, file)!;
  const document = { id: "doc", deletedAt: null };
  const findUnique = vi.fn().mockResolvedValue({
    changeDetails: { uploadRequestHash: receipt.fingerprint },
    document,
    storedFile: { objectKey: "files/guide.pdf" },
  });
  const prisma = {
    documentVersion: { findUnique },
  } as unknown as PrismaService;
  expect(await findUploadReceipt(prisma, receipt)).toEqual({
    document,
    objectKey: "files/guide.pdf",
  });
  await expect(
    findUploadReceipt(prisma, { ...receipt, fingerprint: "changed" }),
  ).rejects.toThrow("Upload request changed");
  findUnique.mockResolvedValueOnce({
    changeDetails: { uploadRequestHash: receipt.fingerprint },
    document: { ...document, deletedAt: new Date() },
  });
  await expect(findUploadReceipt(prisma, receipt)).rejects.toThrow(
    "document deleted",
  );
  findUnique.mockResolvedValueOnce(null);
  expect(await findUploadReceipt(prisma, receipt)).toBeNull();
  findUnique.mockClear();
  expect(await findUploadReceipt(prisma, null)).toBeNull();
  expect(findUnique).not.toHaveBeenCalled();
});

it.each([DocumentsController, DocumentAdminController])(
  "replays an authorized upload without scanning, writing or auditing it twice (%s)",
  async (Controller) => {
    const receipt = uploadReceipt("alice", body, file)!;
    const document = { id: "doc", deletedAt: null };
    const scan = vi.fn();
    const putObject = vi.fn();
    const record = vi.fn();
    const controller = Object.assign(Object.create(Controller.prototype), {
      prisma: {
        documentSpace: {
          findFirst: vi.fn().mockResolvedValue({ id: "space" }),
        },
        documentVersion: {
          findUnique: vi.fn().mockResolvedValue({
            changeDetails: { uploadRequestHash: receipt.fingerprint },
            document,
            storedFile: { objectKey: "files/guide.pdf" },
          }),
        },
      },
      authorization: { can: vi.fn().mockResolvedValue(true) },
      antivirus: { scan },
      storage: { putObject },
      audit: { record },
    });
    expect(
      await controller.upload(
        { identity: { username: "alice", groups: [] } },
        file,
        body,
      ),
    ).toBe(document);
    expect(scan).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  },
);

it("rechecks document permissions before reading a moderator upload receipt", async () => {
  const findUnique = vi.fn();
  const controller = Object.assign(
    Object.create(DocumentsController.prototype),
    {
      prisma: { documentVersion: { findUnique } },
      authorization: { can: vi.fn().mockResolvedValue(false) },
    },
  );
  await expect(
    controller.upload(
      { identity: { username: "alice", groups: [] } },
      file,
      body,
    ),
  ).rejects.toThrow();
  expect(findUnique).not.toHaveBeenCalled();
});

it.each(["files/guide.pdf", "files/earlier.pdf"])(
  "recovers a transaction result without deleting the committed file %s",
  async (committedKey) => {
    const receipt = uploadReceipt("alice", body, file)!;
    const document = { id: "doc", deletedAt: null };
    const removeObject = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn();
    const controller = Object.assign(
      Object.create(DocumentsController.prototype),
      {
        prisma: {
          document: { findFirst: vi.fn().mockResolvedValue(null) },
          documentSpace: {
            findFirst: vi.fn().mockResolvedValue({ id: "space" }),
          },
          documentVersion: {
            findFirst: vi.fn().mockResolvedValue(null),
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValue({
                changeDetails: { uploadRequestHash: receipt.fingerprint },
                document,
                storedFile: { objectKey: committedKey },
              }),
          },
          $transaction: vi
            .fn()
            .mockRejectedValue(new Error("Transaction response lost")),
        },
        authorization: {
          can: vi.fn().mockResolvedValue(true),
          permittedSpaces: vi.fn().mockResolvedValue([{ id: "space" }]),
        },
        antivirus: { scan: vi.fn().mockResolvedValue({ status: "CLEAN" }) },
        storage: {
          uploadKey: vi.fn().mockResolvedValue("files/guide.pdf"),
          putObject: vi.fn().mockResolvedValue(undefined),
          removeObject,
        },
        audit: { record },
      },
    );
    expect(
      await controller.upload(
        { identity: { username: "alice", groups: [] } },
        file,
        body,
      ),
    ).toBe(document);
    expect(removeObject).toHaveBeenCalledTimes(
      committedKey === "files/guide.pdf" ? 0 : 1,
    );
    expect(record).not.toHaveBeenCalled();
  },
);
