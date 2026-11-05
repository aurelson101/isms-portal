import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuditService } from "./audit.service";
import { validateBrandingLogo } from "./branding.controller";
import { PrismaService } from "./prisma.service";
import { AdminOnly } from "./security";
import type { IsmsRequest } from "./types";

const ARTICLES_KEY = "portal.articles";
const MAX_ARTICLES = 30;

type Article = {
  id: string;
  title: string;
  url: string;
  imageDataUrl: string | null;
  createdAt: string;
};

export class ArticleDto {
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsString() @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(400000) imageDataUrl?: string | null;
}

export const validateArticleUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new BadRequestException("Invalid article link");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new BadRequestException("Article link must be http or https");
  if (parsed.username || parsed.password)
    throw new BadRequestException("Article link must not embed credentials");
  return parsed.toString();
};

@Controller("articles")
export class ArticlesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async read(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Article[]> {
    const setting = await client.applicationSetting.findUnique({
      where: { key: ARTICLES_KEY },
    });
    return Array.isArray(setting?.value) ? (setting.value as Article[]) : [];
  }

  // The list lives in a single setting: serialize read-modify-write cycles.
  private async update<T>(
    change: (articles: Article[]) => { articles: Article[]; result: T },
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ARTICLES_KEY}))`;
      const { articles, result } = change(await this.read(tx));
      const value = articles as unknown as Prisma.InputJsonValue;
      await tx.applicationSetting.upsert({
        where: { key: ARTICLES_KEY },
        update: { value },
        create: { key: ARTICLES_KEY, value },
      });
      return result;
    });
  }

  @Get()
  list() {
    return this.read();
  }

  @AdminOnly()
  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: ArticleDto) {
    const title = body.title.trim();
    if (title.length < 3) throw new BadRequestException("Title is too short");
    const article: Article = {
      id: randomUUID(),
      title,
      url: validateArticleUrl(body.url),
      imageDataUrl: validateBrandingLogo(body.imageDataUrl),
      createdAt: new Date().toISOString(),
    };
    await this.update((articles) => {
      if (articles.length >= MAX_ARTICLES)
        throw new BadRequestException("Too many articles");
      return { articles: [article, ...articles], result: null };
    });
    await this.audit.record(
      req,
      "article.create",
      `article:${article.id}`,
      "success",
      { image: Boolean(article.imageDataUrl) },
    );
    return article;
  }

  @AdminOnly()
  @Delete(":id")
  async remove(@Req() req: IsmsRequest, @Param("id") id: string) {
    await this.update((articles) => {
      if (!articles.some((item) => item.id === id))
        throw new NotFoundException("Article not found");
      return {
        articles: articles.filter((item) => item.id !== id),
        result: null,
      };
    });
    await this.audit.record(req, "article.delete", `article:${id}`, "success");
    return { deleted: true };
  }
}
