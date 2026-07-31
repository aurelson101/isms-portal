import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

@Injectable()
export class CryptoService {
  private key() {
    const value = process.env.ENCRYPTION_KEY || "";
    const key = Buffer.from(value, "base64");
    if (key.length !== 32)
      throw new InternalServerErrorException(
        "ENCRYPTION_KEY must contain 32 base64-encoded bytes",
      );
    return key;
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
  }

  decrypt(value: string) {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext)
      throw new InternalServerErrorException(
        "Encrypted secret format is invalid",
      );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
