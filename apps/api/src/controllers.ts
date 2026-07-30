import {
  BadRequestException, Body, ConflictException, Controller, Delete,
  Get, NotFoundException, Param, Post, Put, Query, Req, Res,
  ServiceUnavailableException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID, X509Certificate } from 'crypto';
import { basename, extname } from 'path';
import { createConnection } from 'net';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { register } from 'prom-client';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { IsmsRequest } from './types';
import { AdminOnly, isAdminIdentity } from './security';
import { PrismaService } from './prisma.service';
import { AuthorizationService, type Permission } from './authorization.service';
import { ImportCertificateDto } from './certificate.dto';
import {
  AccessRuleDto, CategoryDto, DirectoryConnectionDto, LocalePreferenceDto, SpaceDto,
} from './admin.dto';
import { AuditService } from './audit.service';
import { StorageService } from './storage.service';
import { AntivirusService } from './antivirus.service';
import { CryptoService } from './crypto.service';
import { DirectoryService } from './directory.service';

const tcpCheck = (host: string, port: number, timeout = 1200) => new Promise<boolean>((resolve) => {
  const socket = createConnection({ host, port });
  const finish = (result: boolean) => { socket.destroy(); resolve(result); };
  socket.setTimeout(timeout);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
});

const certificateStatus = (validFrom: Date, validTo: Date) => {
  const now = new Date();
  if (validTo < now) return 'expired';
  if (validFrom > now) return 'not-yet-valid';
  const days = Math.ceil((validTo.getTime() - now.getTime()) / 86400000);
  if (days <= 90) return 'expiring-soon';
  return 'valid';
};

const certificateSelection = {
  id: true, name: true, subject: true, issuer: true, serialNumber: true,
  fingerprintSha256: true, validFrom: true, validTo: true, createdAt: true, updatedAt: true,
} as const;

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health/live')
  live() { return { status: 'ok' }; }

  @Get('health/ready')
  async ready() {
    const checks = {
      postgres: await tcpCheck('postgres', 5432),
      redis: await tcpCheck('redis', 6379),
      minio: await tcpCheck('minio', Number(process.env.MINIO_PORT || 9000)),
      clamav: await tcpCheck('clamav', 3310),
    };
    if (Object.values(checks).some((healthy) => !healthy)) {
      throw new ServiceUnavailableException({ status: 'error', checks });
    }
    return { status: 'ok', checks };
  }

  @Get('health/details')
  @AdminOnly()
  async details() {
    const [lastSync, certificates] = await Promise.all([
      this.prisma.directorySyncJob.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.trustedCaCertificate.findMany({ select: { id: true, name: true, validTo: true } }),
    ]);
    return {
      services: {
        postgres: await tcpCheck('postgres', 5432),
        redis: await tcpCheck('redis', 6379),
        minio: await tcpCheck('minio', Number(process.env.MINIO_PORT || 9000)),
        clamav: await tcpCheck('clamav', 3310),
      },
      lastDirectorySync: lastSync,
      certificates: certificates.map((certificate) => ({
        ...certificate,
        status: certificateStatus(new Date(0), certificate.validTo),
      })),
    };
  }

  @Get('metrics')
  async metrics(@Res() response: Response) {
    response.type(register.contentType).send(await register.metrics());
  }
}

@ApiTags('identity')
@Controller('me')
export class IdentityController {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(@Req() req: IsmsRequest) {
    const [spaces, preference] = await Promise.all([
      this.authorization.permittedSpaces(req.identity.groups, 'showMenu'),
      this.prisma.userPreference.findUnique({ where: { identity: req.identity.username } }),
    ]);
    return {
      username: req.identity.username,
      displayName: req.identity.displayName,
      isAdmin: isAdminIdentity(req.identity.groups),
      locale: preference?.locale || null,
      demoMode: process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true',
      spaces: spaces.map(({ accessRules: _rules, ...space }) => space),
    };
  }

  @Put('preferences')
  async preference(@Req() req: IsmsRequest, @Body() body: LocalePreferenceDto) {
    return this.prisma.userPreference.upsert({
      where: { identity: req.identity.username },
      update: { locale: body.locale },
      create: { identity: req.identity.username, locale: body.locale },
    });
  }
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Req() req: IsmsRequest,
    @Query('q') query = '',
    @Query('category') category?: string,
    @Query('space') space?: string,
    @Query('sort') sort: 'recent' | 'popular' = 'recent',
  ) {
    const q = query.trim().slice(0, 200);
    const spaces = await this.authorization.permittedSpaces(req.identity.groups, q ? 'search' : 'read');
    const spaceIds = spaces.filter((item) => !space || item.slug === space).map((item) => item.id);
    if (spaceIds.length === 0) return [];
    const fullTextMatches = q
      ? await this.prisma.$queryRaw<Array<{ documentId: string }>>(Prisma.sql`
          SELECT DISTINCT "documentId"
          FROM "DocumentTranslation"
          WHERE to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", ''))
            @@ websearch_to_tsquery('simple', ${q})
          LIMIT 500
        `)
      : [];
    if (q && fullTextMatches.length === 0) return [];
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        spaceId: { in: spaceIds },
        ...(q ? { id: { in: fullTextMatches.map((match) => match.documentId) } } : {}),
        ...(category ? { category: { slug: category, deletedAt: null } } : {}),
      },
      select: {
        id: true, status: true, sensitive: true, publishedAt: true, viewCount: true, downloadCount: true,
        space: { select: { id: true, slug: true, nameFr: true, nameEn: true } },
        category: { select: { id: true, slug: true, nameFr: true, nameEn: true } },
        translations: { select: { locale: true, title: true, description: true } },
        versions: {
          select: { locale: true, version: true, storedFile: { select: { mimeType: true, originalName: true, size: true } } },
          orderBy: { version: 'desc' },
        },
      },
      orderBy: sort === 'popular'
        ? [{ viewCount: 'desc' }, { downloadCount: 'desc' }, { publishedAt: 'desc' }]
        : { publishedAt: 'desc' },
      take: 100,
    });
    return documents.map((document) => ({
      ...document,
      versions: document.versions.map((version) => ({
        ...version,
        storedFile: { ...version.storedFile, size: version.storedFile.size.toString() },
      })),
    }));
  }

  @Get(':id')
  async one(@Req() req: IsmsRequest, @Param('id') id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      include: {
        translations: true,
        category: true,
        space: true,
        versions: {
          select: {
            id: true, locale: true, version: true, createdAt: true,
            storedFile: { select: { originalName: true, mimeType: true, size: true } },
          },
          orderBy: [{ locale: 'asc' }, { version: 'desc' }],
        },
      },
    });
    if (!document || !(await this.authorization.can(req.identity.groups, document.spaceId, 'read'))) {
      await this.audit.record(req, 'authorization.denied', `document:${id}`, 'denied').catch(() => undefined);
      throw new NotFoundException();
    }
    await this.prisma.document.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    return {
      ...document,
      versions: document.versions.map((version) => ({
        ...version,
        storedFile: { ...version.storedFile, size: version.storedFile.size.toString() },
      })),
    };
  }

  @Get(':id/content')
  async preview(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param('id') id: string,
    @Query('locale') locale = 'fr',
  ) {
    return this.stream(req, response, id, locale, 'preview', true);
  }

  @Get(':id/download')
  async download(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param('id') id: string,
    @Query('locale') locale = 'fr',
  ) {
    return this.stream(req, response, id, locale, 'download', false);
  }

  private async stream(
    req: IsmsRequest,
    response: Response,
    id: string,
    locale: string,
    permission: Permission,
    inline: boolean,
  ) {
    if (!['fr', 'en'].includes(locale)) throw new BadRequestException('Unsupported locale');
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: {
        id: true, spaceId: true, sensitive: true,
        versions: {
          where: { locale },
          orderBy: { version: 'desc' },
          take: 1,
          select: { storedFile: true },
        },
      },
    });
    if (!document || !(await this.authorization.can(req.identity.groups, document.spaceId, permission))) {
      await this.audit.record(req, 'authorization.denied', `document:${id}`, 'denied').catch(() => undefined);
      throw new NotFoundException();
    }
    const storedFile = document.versions[0]?.storedFile;
    if (!storedFile) throw new NotFoundException('Translation has no downloadable version');
    const safeName = basename(storedFile.originalName).replace(/[\r\n"]/g, '_');
    response.setHeader('Content-Type', storedFile.mimeType);
    response.setHeader('Content-Length', storedFile.size.toString());
    response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!inline) {
      await this.prisma.document.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
      if (document.sensitive) await this.audit.record(req, 'document.download', `document:${id}`, 'success', { locale });
    }
    const stream = await this.storage.getObject(storedFile.objectKey);
    stream.on('error', () => {
      if (!response.headersSent) response.status(502).json({ message: 'Stored file is unavailable' });
      else response.destroy();
    });
    stream.pipe(response);
  }
}

@ApiTags('administration')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  @Get('check')
  check() {
    return { authorized: true };
  }

  @Get('dashboard')
  async dashboard() {
    const [groups, rules, spaces, documents, syncErrors] = await Promise.all([
      this.prisma.directoryGroup.count({ where: { active: true } }),
      this.prisma.accessRule.count(),
      this.prisma.documentSpace.count({ where: { deletedAt: null } }),
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.directorySyncJob.count({ where: { status: 'ERROR' } }),
    ]);
    return { groups, rules, spaces, documents, syncErrors };
  }

  @Get('groups')
  groups(@Query('q') query = '') {
    const q = query.trim().slice(0, 120);
    return this.prisma.directoryGroup.findMany({
      where: q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { distinguishedName: { contains: q, mode: 'insensitive' } },
      ] } : undefined,
      include: {
        accessRules: { select: { id: true, space: { select: { id: true, slug: true, nameFr: true, nameEn: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Get('access-rules')
  rules() {
    return this.prisma.accessRule.findMany({
      include: { group: true, space: true },
      orderBy: [{ group: { name: 'asc' } }, { space: { slug: 'asc' } }],
    });
  }

  @Post('access-rules')
  async createRule(@Req() req: IsmsRequest, @Body() body: AccessRuleDto) {
    try {
      const rule = await this.prisma.accessRule.create({ data: body, include: { group: true, space: true } });
      await this.audit.record(req, 'access-rule.create', `access-rule:${rule.id}`, 'success', { groupId: body.groupId, spaceId: body.spaceId });
      return rule;
    } catch {
      throw new ConflictException('A rule already exists for this group and space');
    }
  }

  @Put('access-rules/:id')
  async updateRule(@Req() req: IsmsRequest, @Param('id') id: string, @Body() body: AccessRuleDto) {
    const existing = await this.prisma.accessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const rule = await this.prisma.accessRule.update({ where: { id }, data: body, include: { group: true, space: true } });
    await this.audit.record(req, 'access-rule.update', `access-rule:${id}`, 'success', { before: existing, after: body });
    return rule;
  }

  @Delete('access-rules/:id')
  async deleteRule(@Req() req: IsmsRequest, @Param('id') id: string) {
    const existing = await this.prisma.accessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.accessRule.delete({ where: { id } });
    await this.audit.record(req, 'access-rule.delete', `access-rule:${id}`, 'success', { groupId: existing.groupId, spaceId: existing.spaceId });
    return { deleted: true };
  }

  @Get('spaces')
  spaces() {
    return this.prisma.documentSpace.findMany({
      where: { deletedAt: null },
      include: { categories: { where: { deletedAt: null } }, _count: { select: { documents: true, accessRules: true } } },
      orderBy: { slug: 'asc' },
    });
  }

  @Post('spaces')
  async createSpace(@Req() req: IsmsRequest, @Body() body: SpaceDto) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) throw new BadRequestException('Invalid slug');
    const space = await this.prisma.documentSpace.create({ data: { ...body, slug } });
    await this.audit.record(req, 'space.create', `space:${space.id}`, 'success', { slug });
    return space;
  }

  @Put('spaces/:id')
  async updateSpace(@Req() req: IsmsRequest, @Param('id') id: string, @Body() body: SpaceDto) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) throw new BadRequestException('Invalid slug');
    const space = await this.prisma.documentSpace.update({ where: { id }, data: { ...body, slug } });
    await this.audit.record(req, 'space.update', `space:${id}`, 'success', { slug });
    return space;
  }

  @Delete('spaces/:id')
  async deleteSpace(@Req() req: IsmsRequest, @Param('id') id: string) {
    const existing = await this.prisma.documentSpace.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException();
    await this.prisma.documentSpace.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record(req, 'space.archive', `space:${id}`, 'success');
    return { deleted: true };
  }

  @Post('categories')
  async createCategory(@Req() req: IsmsRequest, @Body() body: CategoryDto) {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) throw new BadRequestException('Invalid slug');
    const category = await this.prisma.documentCategory.create({ data: { ...body, slug } });
    await this.audit.record(req, 'category.create', `category:${category.id}`, 'success', { spaceId: body.spaceId, slug });
    return category;
  }

  @Delete('categories/:id')
  async deleteCategory(@Req() req: IsmsRequest, @Param('id') id: string) {
    const existing = await this.prisma.documentCategory.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException();
    await this.prisma.documentCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record(req, 'category.archive', `category:${id}`, 'success');
    return { deleted: true };
  }

  @Get('audit')
  async auditEvents(
    @Query('page') pageValue = '1',
    @Query('limit') limitValue = '50',
    @Query('action') action?: string,
    @Query('result') result?: string,
  ) {
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitValue) || 50));
    const where = {
      ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
      ...(result ? { result } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  @Get('audit/export')
  async exportAudit(@Res() response: Response, @Query('format') format = 'json') {
    const items = await this.prisma.auditEvent.findMany({ orderBy: { occurredAt: 'desc' }, take: 10000 });
    if (format === 'csv') {
      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = [
        ['occurredAt', 'identity', 'ipAddress', 'action', 'resource', 'result', 'correlationId'].join(','),
        ...items.map((item) => [
          item.occurredAt.toISOString(), item.identity, item.ipAddress, item.action,
          item.resource, item.result, item.correlationId,
        ].map(escape).join(',')),
      ];
      response.type('text/csv').attachment('isms-audit.csv').send(lines.join('\n'));
      return;
    }
    response.type('application/json').attachment('isms-audit.json').send(JSON.stringify(items, null, 2));
  }

  @Get('settings')
  async settings() {
    const settings = await this.prisma.applicationSetting.findMany({ orderBy: { key: 'asc' } });
    return settings.map((setting) => {
      const value = setting.value as { protected?: boolean };
      return value?.protected ? { ...setting, value: { protected: true } } : setting;
    });
  }

  @Put('settings/:key')
  async updateSetting(@Req() req: IsmsRequest, @Param('key') key: string, @Body() value: Record<string, unknown>) {
    if (!/^[a-z][a-z0-9.-]{1,79}$/.test(key)) throw new BadRequestException('Invalid setting key');
    const sensitive = /(password|secret|token|credential|bind)/i.test(key);
    const jsonValue = sensitive
      ? { protected: true, encrypted: this.crypto.encrypt(JSON.stringify(value)) } as Prisma.InputJsonValue
      : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    const setting = await this.prisma.applicationSetting.upsert({
      where: { key }, update: { value: jsonValue }, create: { key, value: jsonValue },
    });
    await this.audit.record(req, 'setting.update', `setting:${key}`, 'success');
    return setting;
  }
}

const allowedExtensions: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
  '.txt': ['text/plain'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
};

const magicMatches = (content: Buffer, extension: string) => {
  if (extension === '.pdf') return content.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.png') return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return content[0] === 0xff && content[1] === 0xd8;
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(content.subarray(0, 6).toString());
  if (['.docx', '.xlsx', '.pptx'].includes(extension)) return content[0] === 0x50 && content[1] === 0x4b;
  if (extension === '.txt') return !content.subarray(0, 4096).includes(0);
  return false;
};

@ApiTags('document administration')
@AdminOnly()
@Controller('admin/documents')
export class DocumentAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.document.findMany({
      where: { deletedAt: null },
      include: {
        translations: true,
        versions: { select: { id: true, locale: true, version: true, createdAt: true } },
        category: true, space: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  async upload(
    @Req() req: IsmsRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    if (!['fr', 'en'].includes(body.locale)) throw new BadRequestException('Locale must be fr or en');
    if (!body.spaceId || !body.title?.trim()) throw new BadRequestException('spaceId and title are required');
    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions[extension]?.includes(file.mimetype) || !magicMatches(file.buffer, extension)) {
      throw new BadRequestException('File extension, MIME type and content are inconsistent');
    }
    const [space, category] = await Promise.all([
      this.prisma.documentSpace.findFirst({ where: { id: body.spaceId, deletedAt: null } }),
      body.categoryId ? this.prisma.documentCategory.findFirst({
        where: { id: body.categoryId, spaceId: body.spaceId, deletedAt: null },
      }) : Promise.resolve(null),
    ]);
    if (!space || (body.categoryId && !category)) throw new BadRequestException('Invalid space or category');
    const scan = await this.antivirus.scan(file.buffer);
    const documentId = body.documentId || randomUUID();
    const objectKey = `${scan.status === 'CLEAN' ? 'documents' : 'quarantine'}/${documentId}/${body.locale}/${randomUUID()}${extension}`;
    await this.storage.putObject(objectKey, file.buffer, {
      'Content-Type': file.mimetype,
      'X-Amz-Meta-Sha256': createHash('sha256').update(file.buffer).digest('hex'),
    });
    const result = await this.prisma.$transaction(async (tx) => {
      const document = body.documentId
        ? await tx.document.findUnique({ where: { id: body.documentId } })
        : await tx.document.create({
          data: {
            id: documentId,
            spaceId: body.spaceId,
            categoryId: body.categoryId || null,
            sensitive: body.sensitive === 'true',
            status: scan.status === 'CLEAN' ? 'DRAFT' : 'QUARANTINED',
          },
        });
      if (!document) throw new NotFoundException('Document not found');
      const latest = await tx.documentVersion.findFirst({
        where: { documentId, locale: body.locale }, orderBy: { version: 'desc' },
      });
      const storedFile = await tx.storedFile.create({
        data: {
          objectKey,
          originalName: basename(file.originalname).replace(/[\r\n]/g, '_'),
          mimeType: file.mimetype,
          size: BigInt(file.size),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          scans: { create: {
            status: scan.status,
            signature: 'signature' in scan ? scan.signature : null,
            scannedAt: new Date(),
          } },
        },
      });
      await tx.documentVersion.create({
        data: { documentId, locale: body.locale, version: (latest?.version || 0) + 1, storedFileId: storedFile.id },
      });
      await tx.documentTranslation.upsert({
        where: { documentId_locale: { documentId, locale: body.locale } },
        update: { title: body.title.trim(), description: body.description?.trim() || null },
        create: { documentId, locale: body.locale, title: body.title.trim(), description: body.description?.trim() || null },
      });
      return tx.document.findUnique({ where: { id: documentId }, include: { translations: true, versions: true } });
    });
    await this.audit.record(req, 'document.upload', `document:${documentId}`, scan.status === 'CLEAN' ? 'success' : 'failure', {
      locale: body.locale, scanStatus: scan.status, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'),
    });
    return result;
  }

  @Post(':id/publish')
  async publish(@Req() req: IsmsRequest, @Param('id') id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: { versions: { include: { storedFile: { include: { scans: true } } } } },
    });
    if (!document) throw new NotFoundException();
    if (document.versions.length === 0 || document.versions.some((version) =>
      !version.storedFile.scans.some((scan) => scan.status === 'CLEAN'))) {
      throw new ConflictException('Every document version must pass antivirus scanning');
    }
    const updated = await this.prisma.document.update({
      where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await this.audit.record(req, 'document.publish', `document:${id}`, 'success');
    return updated;
  }

  @Post(':id/archive')
  async archive(@Req() req: IsmsRequest, @Param('id') id: string) {
    const updated = await this.prisma.document.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.record(req, 'document.archive', `document:${id}`, 'success');
    return updated;
  }

  @Post(':id/restore')
  async restore(@Req() req: IsmsRequest, @Param('id') id: string) {
    const updated = await this.prisma.document.update({ where: { id }, data: { status: 'DRAFT' } });
    await this.audit.record(req, 'document.restore', `document:${id}`, 'success');
    return updated;
  }
}

@ApiTags('directory administration')
@AdminOnly()
@Controller('admin/directory-connections')
export class DirectoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly directory: DirectoryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.directoryConnection.findMany({
      select: {
        id: true, name: true, domain: true, primaryHost: true, secondaryHost: true, port: true,
        protocol: true, baseDn: true, userBaseDn: true, groupBaseDn: true, bindDn: true,
        userFilter: true, groupFilter: true, usernameAttribute: true, groupAttribute: true,
        emailAttribute: true, nestedGroups: true, syncIntervalMinutes: true, timeoutMs: true,
        retries: true, enabled: true, caCertificateId: true, lastTestAt: true, lastTestStatus: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: DirectoryConnectionDto) {
    if (!body.bindSecret) throw new BadRequestException('bindSecret is required');
    if (body.protocol === 'LDAPS' && !body.caCertificateId) throw new BadRequestException('LDAPS requires a CA certificate');
    const connection = await this.prisma.directoryConnection.create({
      data: {
        name: body.name,
        domain: body.domain,
        primaryHost: body.primaryHost,
        secondaryHost: body.secondaryHost || null,
        port: body.port,
        protocol: body.protocol,
        baseDn: body.baseDn,
        userBaseDn: body.userBaseDn || null,
        groupBaseDn: body.groupBaseDn || null,
        bindDn: body.bindDn,
        userFilter: body.userFilter,
        groupFilter: body.groupFilter,
        usernameAttribute: body.usernameAttribute,
        groupAttribute: body.groupAttribute,
        emailAttribute: body.emailAttribute,
        nestedGroups: body.nestedGroups,
        syncIntervalMinutes: body.syncIntervalMinutes,
        timeoutMs: body.timeoutMs,
        retries: body.retries,
        enabled: body.enabled,
        caCertificateId: body.caCertificateId || null,
        encryptedBindSecret: this.crypto.encrypt(body.bindSecret),
      },
      select: { id: true, name: true, protocol: true, primaryHost: true, enabled: true },
    });
    await this.audit.record(req, 'directory.create', `directory:${connection.id}`, 'success', { name: connection.name, protocol: connection.protocol });
    return connection;
  }

  @Put(':id')
  async update(@Req() req: IsmsRequest, @Param('id') id: string, @Body() body: DirectoryConnectionDto) {
    const existing = await this.prisma.directoryConnection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (body.protocol === 'LDAPS' && !body.caCertificateId) throw new BadRequestException('LDAPS requires a CA certificate');
    const connection = await this.prisma.directoryConnection.update({
      where: { id },
      data: {
        name: body.name,
        domain: body.domain,
        primaryHost: body.primaryHost,
        secondaryHost: body.secondaryHost || null,
        port: body.port,
        protocol: body.protocol,
        baseDn: body.baseDn,
        userBaseDn: body.userBaseDn || null,
        groupBaseDn: body.groupBaseDn || null,
        bindDn: body.bindDn,
        userFilter: body.userFilter,
        groupFilter: body.groupFilter,
        usernameAttribute: body.usernameAttribute,
        groupAttribute: body.groupAttribute,
        emailAttribute: body.emailAttribute,
        nestedGroups: body.nestedGroups,
        syncIntervalMinutes: body.syncIntervalMinutes,
        timeoutMs: body.timeoutMs,
        retries: body.retries,
        enabled: body.enabled,
        caCertificateId: body.caCertificateId || null,
        ...(body.bindSecret ? { encryptedBindSecret: this.crypto.encrypt(body.bindSecret) } : {}),
      },
      select: { id: true, name: true, protocol: true, primaryHost: true, enabled: true },
    });
    await this.audit.record(req, 'directory.update', `directory:${id}`, 'success', { name: connection.name, protocol: connection.protocol });
    return connection;
  }

  @Delete(':id')
  async remove(@Req() req: IsmsRequest, @Param('id') id: string) {
    const existing = await this.prisma.directoryConnection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.directoryConnection.update({ where: { id }, data: { enabled: false } });
    await this.audit.record(req, 'directory.disable', `directory:${id}`, 'success');
    return { disabled: true };
  }

  @Post(':id/test')
  async test(@Req() req: IsmsRequest, @Param('id') id: string) {
    const result = await this.directory.test(id);
    await this.audit.record(req, 'directory.test', `directory:${id}`, result.status === 'SUCCESS' ? 'success' : 'failure', {
      status: result.status, durationMs: result.durationMs,
    });
    return result;
  }

  @Post(':id/synchronize')
  async synchronize(@Req() req: IsmsRequest, @Param('id') id: string) {
    const result = await this.directory.synchronize(id);
    await this.audit.record(req, 'directory.sync', `directory:${id}`, result.status === 'SUCCESS' ? 'success' : 'failure', { status: result.status });
    return result;
  }

  @Get(':id/jobs')
  jobs(@Param('id') id: string) {
    return this.prisma.directorySyncJob.findMany({
      where: { connectionId: id }, orderBy: { startedAt: 'desc' }, take: 100,
    });
  }
}

@ApiTags('certificates')
@AdminOnly()
@Controller('admin/certificates')
export class CertificatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list() {
    const records = await this.prisma.trustedCaCertificate.findMany({
      select: { ...certificateSelection, connections: { select: { id: true, name: true, enabled: true } } },
      orderBy: { name: 'asc' },
    });
    return records.map((record) => ({
      ...record,
      status: certificateStatus(record.validFrom, record.validTo),
      inUse: record.connections.some((connection) => connection.enabled),
    }));
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: ImportCertificateDto) {
    if (/PRIVATE KEY/i.test(body.pem)) throw new BadRequestException('Private keys are forbidden');
    if ((await this.prisma.trustedCaCertificate.count()) >= 2) {
      throw new ConflictException('At most two CA certificates can be configured');
    }
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(body.pem);
    } catch {
      throw new BadRequestException('Invalid X.509 certificate');
    }
    if (!certificate.ca) throw new BadRequestException('The certificate is not a CA certificate');
    const fingerprintSha256 = createHash('sha256').update(certificate.raw).digest('hex');
    const duplicate = await this.prisma.trustedCaCertificate.findUnique({ where: { fingerprintSha256 } });
    if (duplicate) throw new ConflictException('Duplicate certificate');
    const record = await this.prisma.trustedCaCertificate.create({
      data: {
        id: randomUUID(),
        name: body.name.trim(),
        subject: certificate.subject,
        issuer: certificate.issuer,
        serialNumber: certificate.serialNumber,
        fingerprintSha256,
        validFrom: new Date(certificate.validFrom),
        validTo: new Date(certificate.validTo),
        pem: body.pem,
      },
      select: certificateSelection,
    });
    await this.audit.record(req, 'certificate.import', `certificate:${record.id}`, 'success', { fingerprintSha256 });
    return { ...record, status: certificateStatus(record.validFrom, record.validTo), inUse: false };
  }

  @Get(':id/public')
  async downloadPublic(@Param('id') id: string, @Res() response: Response) {
    const record = await this.prisma.trustedCaCertificate.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    const safeName = record.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    response.type('application/x-pem-file').attachment(`${safeName}.pem`).send(record.pem);
  }

  @Post(':id/test')
  async test(@Req() req: IsmsRequest, @Param('id') id: string) {
    const record = await this.prisma.trustedCaCertificate.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    const status = certificateStatus(record.validFrom, record.validTo);
    await this.audit.record(req, 'certificate.test', `certificate:${id}`, status === 'valid' || status === 'expiring-soon' ? 'success' : 'failure', { status });
    return { id, status, validFrom: record.validFrom, validTo: record.validTo };
  }

  @Delete(':id')
  async remove(@Req() req: IsmsRequest, @Param('id') id: string) {
    const record = await this.prisma.trustedCaCertificate.findUnique({
      where: { id }, include: { connections: { select: { id: true, name: true, enabled: true } } },
    });
    if (!record) throw new NotFoundException();
    const affectedConnections = record.connections.filter((connection) => connection.enabled);
    await this.prisma.$transaction([
      this.prisma.directoryConnection.updateMany({
        where: { caCertificateId: id },
        data: { enabled: false, caCertificateId: null },
      }),
      this.prisma.trustedCaCertificate.delete({ where: { id } }),
    ]);
    await this.audit.record(req, 'certificate.delete', `certificate:${id}`, 'success', {
      fingerprintSha256: record.fingerprintSha256,
      disabledConnections: affectedConnections.map((connection) => connection.id),
    });
    return { deleted: true, disabledConnections: affectedConnections };
  }
}
