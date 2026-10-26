import { ConflictException, NotFoundException } from "@nestjs/common";
import { validate } from "class-validator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentStatusDto } from "./admin.dto";
import { DocumentAdminController } from "./controllers";

const id = "document-id";
const req = { identity: { username: "admin" } } as Parameters<DocumentAdminController["changeStatus"]>[0];
const document = { findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() };
const prisma = { document, $transaction: vi.fn(async callback => callback({ document })) };
const audit = { record: vi.fn() };
let controller: DocumentAdminController;

beforeEach(() => {
  vi.clearAllMocks();
  controller = new DocumentAdminController(prisma as never, {} as never, {} as never, audit as never, {} as never);
});

describe("administrator document state selection", () => {
  it.each(["DRAFT", "PUBLISHED", "ARCHIVED"])("accepts the supported state %s", async status => {
    const dto = Object.assign(new DocumentStatusDto(), { status });
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(["QUARANTINED", "DELETED", "", undefined])("rejects unsupported input %s", async status => {
    expect((await validate(Object.assign(new DocumentStatusDto(), { status }))).length).toBeGreaterThan(0);
  });
  it("returns a published document to draft without creating a version", async () => {
    document.findFirst.mockResolvedValue({ id, status: "PUBLISHED" });
    document.updateMany.mockResolvedValue({ count: 1 });
    const result = { id, status: "DRAFT" };
    document.findUnique.mockResolvedValue(result);
    await expect(controller.changeStatus(req, id, { status: "DRAFT" })).resolves.toBe(result);
    expect(document.updateMany).toHaveBeenCalledWith({ where: { id, deletedAt: null, status: "PUBLISHED" }, data: { status: "DRAFT" } });
    expect(audit.record).toHaveBeenCalledWith(req, "document.draft", `document:${id}`, "success");
  });
  it.each(["PUBLISHED", "ARCHIVED"] as const)("reuses existing validation for %s", async status => {
    document.findFirst.mockResolvedValue({ id, status: "DRAFT" });
    const action = vi.spyOn(controller, status === "PUBLISHED" ? "publish" : "archive").mockResolvedValue({ id, status } as never);
    await controller.changeStatus(req, id, { status });
    expect(action).toHaveBeenCalledWith(req, id);
  });
  it("reuses archived restoration", async () => {
    document.findFirst.mockResolvedValue({ id, status: "ARCHIVED" });
    const action = vi.spyOn(controller, "restore").mockResolvedValue({ id, status: "DRAFT" } as never);
    await controller.changeStatus(req, id, { status: "DRAFT" });
    expect(action).toHaveBeenCalledWith(req, id);
  });
  it.each(["DRAFT", "PUBLISHED", "ARCHIVED"] as const)("cannot override quarantine with %s", async status => {
    document.findFirst.mockResolvedValue({ id, status: "QUARANTINED" });
    await expect(controller.changeStatus(req, id, { status })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it("ignores an unchanged status", async () => {
    document.findFirst.mockResolvedValue({ id, status: "DRAFT" });
    await controller.changeStatus(req, id, { status: "DRAFT" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it("excludes deleted or missing documents", async () => {
    document.findFirst.mockResolvedValue(null);
    await expect(controller.changeStatus(req, id, { status: "DRAFT" })).rejects.toBeInstanceOf(NotFoundException);
    expect(document.findFirst).toHaveBeenCalledWith({ where: { id, deletedAt: null } });
  });
  it("rejects a concurrent state change without logging success", async () => {
    document.findFirst.mockResolvedValue({ id, status: "PUBLISHED" });
    document.updateMany.mockResolvedValue({ count: 0 });
    await expect(controller.changeStatus(req, id, { status: "DRAFT" })).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
