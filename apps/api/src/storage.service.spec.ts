import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, symlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { StorageService } from "./storage.service";
import { StorageTargetsService, type StorageTarget } from "./storage-targets.service";
import { CryptoService } from "./crypto.service";
import { StorageOptionsController } from "./storage-targets.controller";

const s3 = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...await original<object>(), S3Client: class { send = s3.send; destroy = s3.destroy; },
}));

const id = "1205923c-2a65-4e66-aeb3-9f7fdc1498cf";
const target: StorageTarget = { id, name: "Archive", type: "s3", enabled: true, testStatus: "success", testedAt: null, revision: "first", bucket: "isms", prefix: "files", endpoint: "https://s3.example.test", region: "test" };

describe("optional document storage", () => {
  let root: string;
  let storage: StorageService;
  const get = vi.fn();
  const markTest = vi.fn();
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "isms-storage-test-"));
    vi.stubEnv("DOCUMENT_STORAGE_PATH", root);
    vi.stubEnv("DOCUMENT_SMB_ROOT", join(root, "smb"));
    get.mockReset().mockResolvedValue({ ...target });
    markTest.mockReset().mockResolvedValue(undefined);
    s3.send.mockReset(); s3.destroy.mockClear();
    storage = new StorageService({ get, markTest, credentials: () => ({ accessKeyId: "test", secretAccessKey: "test" }) } as never);
    await storage.onModuleInit();
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

  it("keeps the original primary volume by default, including deletion", async () => {
    const key = await storage.uploadKey("documents/a/file.pdf");
    expect(key).toBe("documents/a/file.pdf");
    await storage.putObject(key, Buffer.from("document"), {});
    expect((await storage.getBuffer(key)).toString()).toBe("document");
    expect((await storage.statObject(key)).size).toBe(8);
    await storage.removeObject(key);
    await expect(storage.getBuffer(key)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it.each(["../file", "/file", "documents/../../file", "documents\\file", "documents//file"])("rejects unsafe object keys: %s", async (key) => {
    await expect(storage.putObject(key, Buffer.from("x"), {})).rejects.toThrow();
  });
  it("rejects symbolic links in a storage path", async () => {
    await symlink(tmpdir(), join(root, "outside"));
    await expect(storage.putObject("outside/file", Buffer.from("x"), {})).rejects.toThrow("symlinks");
  });
  it("requires tested, enabled targets for new uploads", async () => {
    get.mockResolvedValueOnce({ ...target, enabled: false });
    await expect(storage.uploadKey("documents/file", id)).rejects.toThrow("not available");
    get.mockResolvedValueOnce({ ...target, testStatus: "failure" });
    await expect(storage.uploadKey("documents/file", id)).rejects.toThrow("not available");
    expect(await storage.uploadKey("documents/file", id)).toBe(`targets/${id}/documents/file`);
  });
  it("keeps watermarked copies on the source target", () => {
    expect(storage.derivedKey(`targets/${id}/documents/original`, "documents/distributed")).toBe(`targets/${id}/documents/distributed`);
    expect(storage.derivedKey("documents/original", "documents/distributed")).toBe("documents/distributed");
  });
  it("reads and deletes existing S3 documents even when a target is disabled", async () => {
    get.mockResolvedValue({ ...target, enabled: false });
    s3.send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from("stored")]) }).mockResolvedValueOnce({});
    expect((await storage.getBuffer(`targets/${id}/documents/file`)).toString()).toBe("stored");
    await storage.removeObject(`targets/${id}/documents/file`);
    expect(s3.send.mock.calls[1][0].input).toMatchObject({ Bucket: "isms", Key: "files/documents/file" });
  });
  it("writes content type and integrity metadata to S3", async () => {
    s3.send.mockResolvedValue({});
    await storage.putObject(`targets/${id}/documents/file`, Buffer.from("stored"), { "Content-Type": "application/pdf", "X-Amz-Meta-Sha256": "hash" });
    expect(s3.send.mock.calls[0][0].input).toMatchObject({ ContentType: "application/pdf", Metadata: { sha256: "hash" } });
  });
  it("does not fall back to local storage when a CIFS mount is missing", async () => {
    await mkdir(join(root, "smb", "documents"), { recursive: true });
    get.mockResolvedValue({ ...target, type: "smb", mount: "documents" });
    await expect(storage.putObject(`targets/${id}/file`, Buffer.from("x"), {})).rejects.toThrow("not mounted");
  });
  it("marks a test successful only after write, read and delete succeed", async () => {
    let body: Buffer;
    s3.send.mockImplementation(async (command: { input: { Body?: Buffer } }) => {
      if (command.input.Body) body = command.input.Body;
      return { Body: Readable.from([body]) };
    });
    expect((await storage.testTarget(id)).success).toBe(true);
    expect(markTest).toHaveBeenCalledWith(expect.objectContaining({ id }), true);
    expect(s3.send).toHaveBeenCalledTimes(3);
  });
  it("fails the probe when deletion fails and never returns secrets in errors", async () => {
    s3.send.mockRejectedValue(new Error("secret-access-key"));
    expect(await storage.testTarget(id)).toMatchObject({ success: false });
    expect(markTest).toHaveBeenCalledWith(expect.objectContaining({ id }), false);
  });
  it("requires upload or edit permission to list optional storage", async () => {
    const available = vi.fn().mockResolvedValue([{ id }]);
    const can = vi.fn().mockResolvedValue(false);
    const controller = new StorageOptionsController({ available } as never, { can } as never);
    const req = { identity: { groups: [] } } as never;
    await expect(controller.list(req, "space")).rejects.toThrow();
    expect(available).not.toHaveBeenCalled();
    can.mockResolvedValue(true);
    expect(await controller.list(req, "space")).toEqual([{ id }]);
  });
});

describe("storage target configuration", () => {
  const create = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn();
  const config = new StorageTargetsService({ applicationSetting: { create, updateMany, findUnique } } as never, new CryptoService());
  beforeEach(() => { vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64")); vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllEnvs());
  it("encrypts credentials and omits them from API responses", async () => {
    const result = await config.create({ type: "s3", name: "Storage", endpoint: "https://s3.example.test", bucket: "isms", region: "eu-west-1", accessKeyId: "access", secretAccessKey: "secret" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).toMatchObject({ enabled: false, testStatus: "untested", hasCredentials: true });
    const stored = create.mock.calls[0][0].data.value;
    expect(stored.credentials).not.toContain("secret");
    expect(config.credentials(stored)).toEqual({ accessKeyId: "access", secretAccessKey: "secret" });
  });
  it("requires TLS for S3", async () => {
    await expect(config.create({ type: "s3", name: "Storage", endpoint: "http://s3.example.test" })).rejects.toThrow("HTTPS");
  });
  it("rejects path escapes in SMB mount names", async () => {
    await expect(config.create({ type: "smb", name: "Storage", mount: "../documents" })).rejects.toThrow();
  });
  it("prevents changing destinations for existing files", async () => {
    await expect(config.update(id, { bucket: "other" })).rejects.toThrow("cannot be changed");
  });
  it("requires a new test after credential rotation", async () => {
    findUnique.mockResolvedValue({ value: { ...target } });
    expect(await config.update(id, { accessKeyId: "new", secretAccessKey: "secret" })).toMatchObject({ enabled: false, testStatus: "untested" });
  });
});
