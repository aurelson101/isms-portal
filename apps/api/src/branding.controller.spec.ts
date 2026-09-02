import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateBrandingLogo } from "./branding.controller";

describe("branding logo validation", () => {
  it("accepts a valid PNG data URL", () => {
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const value = `data:image/png;base64,${png.toString("base64")}`;
    expect(validateBrandingLogo(value)).toBe(value);
  });

  it("rejects SVG and forged image content", () => {
    expect(() =>
      validateBrandingLogo(
        `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateBrandingLogo(
        `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      ),
    ).toThrow(BadRequestException);
  });
});
