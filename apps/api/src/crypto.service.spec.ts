import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CryptoService } from "./crypto.service";

describe("CryptoService", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
  });

  it("encrypts directory secrets with authenticated encryption", () => {
    const service = new CryptoService();
    const encrypted = service.encrypt("correct horse battery staple");
    expect(encrypted).not.toContain("correct horse");
    expect(service.decrypt(encrypted)).toBe("correct horse battery staple");
  });

  it("rejects a modified encrypted secret", () => {
    const service = new CryptoService();
    const encrypted = service.encrypt("directory secret");
    expect(() => service.decrypt(`${encrypted.slice(0, -2)}AA`)).toThrow();
  });
});
