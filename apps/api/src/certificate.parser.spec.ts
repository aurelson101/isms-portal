import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { parseCaCertificates } from "./certificate.parser";

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), "../../tests/fixtures", name));

describe("parseCaCertificates", () => {
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
    expect(() =>
      parseCaCertificates({
        contentBase64: Buffer.from("not a certificate").toString("base64"),
      }),
    ).toThrow(/X.509 PEM\/DER or PKCS#7/);
  });
});
