import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Readable } from "node:stream";
import { DocumentsController } from "./controllers";
import { readMipOffice } from "./mip-reader";
import type { IsmsRequest } from "./types";

vi.mock("./mip-reader", async (original) => ({
  ...(await original<typeof import("./mip-reader")>()),
  readMipOffice: vi.fn(),
}));
const encrypted = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
const key = "documents/id/en/mip-11111111-2222-3333-4444-555555555555.xlsx";
const req = {
  identity: {
    username: "reader@example.com",
    source: "trusted-proxy",
    groups: [],
  },
} as unknown as IsmsRequest;
function fixture() {
  const file = {
    objectKey: key,
    size: BigInt(8),
    originalName: "protected.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    scans: [{ status: "CLEAN" }],
  };
  const prisma = {
    document: {
      findFirst: vi.fn(async () => ({
        id: "id",
        spaceId: "space",
        status: "PUBLISHED",
        sensitive: false,
        versions: [{ storedFile: file }],
      })),
      update: vi.fn(),
    },
    userDocumentActivity: { upsert: vi.fn() },
  };
  const authorization = { can: vi.fn(async () => true) };
  const storage = { getObject: vi.fn(async () => Readable.from([encrypted])) };
  const antivirus = { scan: vi.fn(async () => ({ status: "CLEAN" })) };
  const audit = { record: vi.fn(async () => undefined) };
  const response = {
    setHeader: vi.fn(),
    end: vi.fn((_content: Buffer, done: () => void) => done()),
    once: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  const controller = new DocumentsController(
    prisma as never,
    authorization as never,
    storage as never,
    antivirus as never,
    audit as never,
    {} as never,
    {} as never,
  );
  return { controller, authorization, storage, antivirus, audit, response };
}
beforeEach(() => {
  vi.mocked(readMipOffice).mockReset();
});
describe("protected Office preview route", () => {
  it("checks ISMS access before reading or delegating", async () => {
    const f = fixture();
    f.authorization.can.mockResolvedValue(false);
    await expect(
      f.controller.preview(req, f.response as never, "id", "en"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getObject).not.toHaveBeenCalled();
    expect(readMipOffice).not.toHaveBeenCalled();
  });
  it("scans authorized plaintext and returns a no-store preview", async () => {
    const f = fixture();
    const plain = Buffer.from("PK content");
    vi.mocked(readMipOffice).mockResolvedValue(plain);
    await f.controller.preview(req, f.response as never, "id", "en");
    expect(f.antivirus.scan).toHaveBeenCalledWith(plain);
    expect(f.response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(f.response.setHeader).toHaveBeenCalledWith(
      "Content-Length",
      String(plain.length),
    );
    expect(f.response.end).toHaveBeenCalledWith(plain, expect.any(Function));
    f.response.end.mock.calls[0][1]();
    expect(plain.every((byte) => byte === 0)).toBe(true);
  });
  it("does not release plaintext if its fresh antivirus scan fails", async () => {
    const f = fixture();
    const plain = Buffer.from("PK content");
    vi.mocked(readMipOffice).mockResolvedValue(plain);
    f.antivirus.scan.mockResolvedValue({ status: "INFECTED" });
    await expect(
      f.controller.preview(req, f.response as never, "id", "en"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(f.response.end).not.toHaveBeenCalled();
    expect(plain.every((byte) => byte === 0)).toBe(true);
  });
  it("never falls back to the original or another identity after a MIP denial", async () => {
    const f = fixture();
    vi.mocked(readMipOffice).mockRejectedValue(new ForbiddenException());
    await expect(
      f.controller.preview(req, f.response as never, "id", "en"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.storage.getObject).toHaveBeenCalledTimes(1);
    expect(f.response.end).not.toHaveBeenCalled();
    expect(f.audit.record).toHaveBeenCalledWith(
      req,
      "document.mip.preview",
      "document:id",
      "denied",
      { locale: "en" },
      { notify: false },
    );
  });
});
