import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { readMipEnvelope, readMipOffice, scanMipUpload, isProtectedOffice, isMipObjectKey, withMipCapacity } from "./mip-reader";
import type { IsmsRequest } from "./types";

vi.mock("fs/promises", () => ({ readFile: vi.fn(async () => "a".repeat(64)) }));
const encrypted = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225, 0]);
const request = { identity: { username: "reader@example.com", source: "trusted-proxy", groups: [] } } as unknown as IsmsRequest;
beforeEach(() => {
  vi.stubEnv("MIP_READER_ENABLED", "true");
  vi.stubEnv("MIP_READER_URL", "http://mip-reader:8080");
  vi.stubEnv("MIP_API_KEY_FILE", "/run/secrets/mip_api_key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("optional protected Office reader", () => {
  it("does not accumulate concurrent plaintext previews", async () => {
    let release!: () => void;
    const running = withMipCapacity(() => new Promise<void>((resolve) => { release = resolve; }));
    await expect(withMipCapacity(async () => undefined)).rejects.toBeInstanceOf(ServiceUnavailableException);
    release(); await running;
    await expect(withMipCapacity(async () => "available")).resolves.toBe("available");
  });
  it("bounds the encrypted storage stream before buffering", async () => {
    let closed = false;
    async function* source() {
      try { yield Buffer.alloc(50 * 1024 * 1024 + 1); }
      finally { closed = true; }
    }
    await expect(readMipEnvelope(source())).rejects.toBeInstanceOf(BadRequestException);
    expect(closed).toBe(true);
  });
  it("recognizes only supported Office envelopes and internal object markers", () => {
    expect(isProtectedOffice(encrypted, ".xlsx")).toBe(true);
    expect(isProtectedOffice(encrypted, ".xls")).toBe(false);
    expect(isProtectedOffice(Buffer.from("PK"), ".xlsx")).toBe(false);
    expect(isMipObjectKey("documents/id/en/mip-11111111-2222-3333-4444-555555555555.xlsx")).toBe(true);
    expect(isMipObjectKey("documents/id/en/normal.xlsx")).toBe(false);
  });
  it("is disabled by default and does not call the reader", async () => {
    vi.stubEnv("MIP_READER_ENABLED", "false");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(readMipOffice(request, encrypted, ".xlsx")).rejects.toBeInstanceOf(BadRequestException);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["local-admin", "directory-session", "anonymous"])("does not impersonate %s identities", async (source) => {
    await expect(readMipOffice({ identity: { ...request.identity, source } } as IsmsRequest, encrypted, ".xlsx")).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("does not permit a configurable proxy destination", async () => {
    vi.stubEnv("MIP_READER_URL", "http://untrusted.invalid");
    await expect(readMipOffice(request, encrypted, ".xlsx")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("passes the server-authenticated user and preserves the encrypted input", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([0x50, 0x4b, 3, 4]))); vi.stubGlobal("fetch", fetch);
    const before = Buffer.from(encrypted);
    const result = await readMipOffice(request, encrypted, ".xlsx");
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(fetch.mock.calls[0]).toMatchObject(["http://mip-reader:8080/v1/office-preview", { headers: { "X-Mip-User": "reader@example.com" }, redirect: "error" }]);
    expect(encrypted).toEqual(before);
  });
  it.each([403, 422, 503])("does not release content on reader status %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not disclosed", { status })));
    await expect(readMipOffice(request, encrypted, ".xlsx")).rejects.toThrow();
  });
  it("rejects non-Office plaintext", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not Office")));
    await expect(readMipOffice(request, encrypted, ".xlsx")).rejects.toBeInstanceOf(BadRequestException);
  });
  it("scans plaintext rather than the encrypted envelope and clears the buffer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0x50, 0x4b, 3, 4]))));
    let scanned: Buffer | undefined;
    const scan = vi.fn(async (buffer: Buffer) => { expect(buffer[0]).toBe(0x50); scanned = buffer; return { status: "CLEAN" }; });
    await expect(scanMipUpload(request, encrypted, ".xlsx", false, { scan } as never)).resolves.toEqual({ status: "CLEAN" });
    expect(scanned?.every((byte) => byte === 0)).toBe(true);
  });
  it("does not bypass an antivirus failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0x50, 0x4b]))));
    const scan = vi.fn(async () => ({ status: "INFECTED", signature: "test" }));
    await expect(scanMipUpload(request, encrypted, ".xlsx", false, { scan } as never)).resolves.toMatchObject({ status: "INFECTED" });
  });
  it("does not create unprotected watermark derivatives", async () => {
    const scan = vi.fn();
    await expect(scanMipUpload(request, encrypted, ".xlsx", true, { scan } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(scan).not.toHaveBeenCalled();
  });
});
