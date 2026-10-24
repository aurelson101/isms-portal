import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentAdminController } from "./controllers";

const id = "a30e3571-169c-42e2-a383-37992c554a77";
const req = { identity: { username: "admin" } } as Parameters<DocumentAdminController["restoreFromTrash"]>[0];
const tx = { document: { updateMany: vi.fn(), findUnique: vi.fn() } };
const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
const audit = { record: vi.fn() };
const controller = new DocumentAdminController(prisma as never, {} as never, {} as never, audit as never, {} as never);

beforeEach(() => vi.clearAllMocks());

describe("archived document restoration", () => {
  it("returns an archived document to draft without changing its metadata", async () => {
    const document = { id, status: "DRAFT", deletedAt: null, categoryId: "category", sensitive: true };
    tx.document.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.document.findUnique.mockResolvedValueOnce(document);
    await expect(controller.restore(req, id)).resolves.toBe(document);
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { id, deletedAt: null, status: "ARCHIVED" }, data: { status: "DRAFT" },
    });
    expect(audit.record).toHaveBeenCalledWith(req, "document.restore", `document:${id}`, "success");
  });

  it("does not restore missing, deleted or non-archived documents", async () => {
    tx.document.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(controller.restore(req, id)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id, deletedAt: null, status: "ARCHIVED" },
    }));
    expect(tx.document.findUnique).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("does not log success if reading the restored document fails", async () => {
    tx.document.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.document.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(controller.restore(req, id)).rejects.toThrow("database unavailable");
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("document trash restoration", () => {
  it("restores only a deleted document, archived and with its metadata intact", async () => {
    const document = { id, status: "ARCHIVED", deletedAt: null, categoryId: "category", spaceId: "space", sensitive: true };
    tx.document.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.document.findUnique.mockResolvedValueOnce(document);
    await expect(controller.restoreFromTrash(req, id)).resolves.toBe(document);
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, status: "ARCHIVED" },
    });
    expect(tx.document.findUnique).toHaveBeenCalledWith({ where: { id } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(req, "document.trash.restore", `document:${id}`, "success");
  });

  it.each(["active document", "unknown document", "already restored document"])("rejects an %s without recording a successful restoration", async () => {
    tx.document.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(controller.restoreFromTrash(req, id)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id, deletedAt: { not: null } } }));
    expect(tx.document.findUnique).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("propagates a database failure without recording a successful restoration", async () => {
    tx.document.updateMany.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(controller.restoreFromTrash(req, id)).rejects.toThrow("database unavailable");
    expect(tx.document.findUnique).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
