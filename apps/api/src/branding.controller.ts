import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuditService } from "./audit.service";
import { PrismaService } from "./prisma.service";
import { AdminOnly } from "./security";
import type { IsmsRequest } from "./types";

const BRANDING_KEY = "portal.branding";
const DEFAULT_BRANDING = { title: "ISMS Portal", logoDataUrl: null } as const;
const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export class BrandingDto {
  @IsString() @MinLength(3) @MaxLength(60) title!: string;
  @IsOptional() @IsString() @MaxLength(400000) logoDataUrl?: string | null;
}

export const validateBrandingLogo = (dataUrl?: string | null) => {
  if (!dataUrl) return null;
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(
      dataUrl,
    );
  if (!match || !allowedLogoTypes.has(match[1]))
    throw new BadRequestException("Unsupported logo format");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > 256 * 1024)
    throw new BadRequestException("Logo must be 256 KiB or smaller");
  const valid =
    (match[1] === "image/png" &&
      buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
    (match[1] === "image/jpeg" &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer.at(-2) === 0xff &&
      buffer.at(-1) === 0xd9) ||
    (match[1] === "image/webp" &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP");
  if (!valid) throw new BadRequestException("Logo content is invalid");
  return dataUrl;
};

@Controller("branding")
export class BrandingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async branding() {
    const setting = await this.prisma.applicationSetting.findUnique({
      where: { key: BRANDING_KEY },
    });
    const value = setting?.value as {
      title?: string;
      logoDataUrl?: string | null;
    } | null;
    return {
      title: value?.title || DEFAULT_BRANDING.title,
      logoDataUrl: value?.logoDataUrl || null,
    };
  }

  @AdminOnly()
  @Put()
  async update(@Req() req: IsmsRequest, @Body() body: BrandingDto) {
    const title = body.title.trim();
    if (title.length < 3)
      throw new BadRequestException("Portal title is too short");
    const value = {
      title,
      logoDataUrl: validateBrandingLogo(body.logoDataUrl),
    } as Prisma.InputJsonValue;
    await this.prisma.applicationSetting.upsert({
      where: { key: BRANDING_KEY },
      update: { value },
      create: { key: BRANDING_KEY, value },
    });
    await this.audit.record(
      req,
      "branding.update",
      "setting:portal.branding",
      "success",
      { customLogo: Boolean(body.logoDataUrl) },
    );
    return value;
  }
}
