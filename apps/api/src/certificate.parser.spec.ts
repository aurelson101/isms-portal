import { readFileSync } from "fs";
import { X509Certificate } from "crypto";
import { execFileSync } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCaCertificates } from "./certificate.parser";

vi.mock("child_process", () => ({ execFileSync: vi.fn() }));

const fixture = (name: string) =>
  readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));

describe("parseCaCertificates", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset().mockReturnValue(new X509Certificate(fixture("test-ca.der.cer")).toString());
  });
  it.each(["test-ca.der.cer", "test-adcs-chain.cer"])(
    "imports the ADCS-compatible fixture %s",
    (name) => {
      const certificates = parseCaCertificates({
        contentBase64: fixture(name).toString("base64"),
      });

      expect(certificates).toHaveLength(1);
      expect(certificates[0].ca).toBe(true);
      expect(certificates[0].subject).toContain("ISMS DER Test CA");
    },
  );

  it("refuses content that is not a supported certificate container", () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error("Invalid container"); });
    expect(() =>
      parseCaCertificates({
        contentBase64: Buffer.from("not a certificate").toString("base64"),
      }),
    ).toThrow(/X.509 PEM\/DER or PKCS#7/);
  });

  it("imports a PEM-encoded PKCS7 chain", () => {
    const data = fixture("test-adcs-chain.cer");
    const text = data.toString("utf8");
    const pem = text.includes("-----BEGIN") ? text : `-----BEGIN PKCS7-----\n${data.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PKCS7-----`;
    expect(parseCaCertificates({ pem })[0].ca).toBe(true);
  });

  it("rejects private keys and oversized containers before parsing", () => {
    expect(() => parseCaCertificates({ pem: "-----BEGIN PRIVATE KEY-----\ninvalid" })).toThrow("Private keys are forbidden");
    expect(() => parseCaCertificates({ contentBase64: Buffer.alloc(49 * 1024).toString("base64") })).toThrow("48 KiB");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("bounds the parser subprocess and does not invoke a shell", () => {
    parseCaCertificates({ contentBase64: fixture("test-adcs-chain.cer").toString("base64") });
    expect(execFileSync).toHaveBeenCalledWith("openssl", expect.arrayContaining(["pkcs7", "-print_certs"]), expect.objectContaining({ timeout: 3000, maxBuffer: 48 * 1024 * 4, stdio: ["pipe", "pipe", "pipe"] }));
  });
});
