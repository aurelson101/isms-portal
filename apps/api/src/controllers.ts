import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Post, Query, Req, ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID, X509Certificate } from 'crypto';
import { createConnection } from 'net';
import { ApiTags } from '@nestjs/swagger';
import { register } from 'prom-client';
import type { IsmsRequest } from './types';
import { AdminOnly } from './security';
import { PrismaService } from './prisma.service';
import { AuthorizationService } from './authorization.service';
import { ImportCertificateDto } from './certificate.dto';

const adminGroups = () => (process.env.ISMS_ADMIN_GROUPS || 'ISMS-ADMINS,ISMS-SUPER-ADMINS')
  .split(',').map((group) => group.trim()).filter(Boolean);

const tcpCheck = (host: string, port: number, timeout = 1200) => new Promise<boolean>((resolve) => {
  const socket = createConnection({ host, port });
  const finish = (result: boolean) => { socket.destroy(); resolve(result); };
  socket.setTimeout(timeout);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
});

@Controller()
export class HealthController {
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

  @Get('metrics')
  async metrics() {
    return register.metrics();
  }
}

@ApiTags('identity')
@Controller('me')
export class IdentityController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get()
  async get(@Req() req: IsmsRequest) {
    const spaces = await this.authorization.permittedSpaces(req.identity.groups, 'showMenu');
    return {
      username: req.identity.username,
      displayName: req.identity.displayName,
      isAdmin: req.identity.groups.some((group) => adminGroups().includes(group)),
      spaces: spaces.map(({ accessRules: _rules, ...space }) => space),
    };
  }
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  @Get()
  async list(@Req() req: IsmsRequest, @Query('q') query = '', @Query('category') category?: string) {
    const spaces = await this.authorization.permittedSpaces(req.identity.groups, query ? 'search' : 'read');
    const spaceIds = spaces.map((space) => space.id);
    if (spaceIds.length === 0) return [];
    const q = query.trim().slice(0, 200);
    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        spaceId: { in: spaceIds },
        ...(category ? { category: { slug: category } } : {}),
        ...(q ? { translations: { some: { OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ] } } } : {}),
      },
      select: {
        id: true, status: true, publishedAt: true,
        space: { select: { slug: true } },
        category: { select: { slug: true } },
        translations: { select: { locale: true, title: true, description: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  async one(@Req() req: IsmsRequest, @Param('id') id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      include: { translations: true, category: true, space: true },
    });
    if (!document || !(await this.authorization.can(req.identity.groups, document.spaceId, 'read'))) {
      throw new NotFoundException();
    }
    return document;
  }

  @Get(':id/download')
  async download(@Req() req: IsmsRequest, @Param('id') id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true, spaceId: true, versions: { orderBy: { version: 'desc' }, take: 1,
        select: { locale: true, storedFile: { select: { objectKey: true, originalName: true, mimeType: true } } } } },
    });
    if (!document || !(await this.authorization.can(req.identity.groups, document.spaceId, 'download'))) {
      throw new NotFoundException();
    }
    if (document.versions.length === 0) throw new NotFoundException('No downloadable version');
    return document.versions[0];
  }
}

@ApiTags('administration')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  async dashboard() {
    const [groups, rules, spaces, syncErrors] = await Promise.all([
      this.prisma.directoryGroup.count({ where: { active: true } }),
      this.prisma.accessRule.count(),
      this.prisma.documentSpace.count({ where: { deletedAt: null } }),
      this.prisma.directorySyncJob.count({ where: { status: 'ERROR' } }),
    ]);
    return { groups, rules, spaces, syncErrors };
  }

  @Get('groups')
  groups() {
    return this.prisma.directoryGroup.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('access-rules')
  rules() {
    return this.prisma.accessRule.findMany({ include: { group: true, space: true } });
  }
}

const certificateStatus = (validFrom: Date, validTo: Date) => {
  const now = new Date();
  if (validTo < now) return 'expired';
  if (validFrom > now) return 'not-yet-valid';
  if (validTo.getTime() - now.getTime() <= 30 * 86400000) return 'expiring-soon';
  return 'valid';
};

@ApiTags('certificates')
@AdminOnly()
@Controller('admin/certificates')
export class CertificatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const records = await this.prisma.trustedCaCertificate.findMany({
      select: {
        id: true, name: true, subject: true, issuer: true, serialNumber: true,
        fingerprintSha256: true, validFrom: true, validTo: true, createdAt: true,
        _count: { select: { connections: true } },
      },
      orderBy: { name: 'asc' },
    });
    return records.map((record) => ({ ...record, status: certificateStatus(record.validFrom, record.validTo),
      inUse: record._count.connections > 0 }));
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: ImportCertificateDto) {
    if (/PRIVATE KEY/i.test(body.pem)) throw new BadRequestException('Private keys are forbidden');
    let certificate: X509Certificate;
    try { certificate = new X509Certificate(body.pem); } catch { throw new BadRequestException('Invalid X.509 certificate'); }
    if (!certificate.ca) throw new BadRequestException('The certificate is not a CA certificate');
    const fingerprintSha256 = createHash('sha256').update(certificate.raw).digest('hex');
    const duplicate = await this.prisma.trustedCaCertificate.findUnique({ where: { fingerprintSha256 } });
    if (duplicate) throw new ConflictException('Duplicate certificate');
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.trustedCaCertificate.create({ data: {
        id: randomUUID(), name: body.name.trim(), subject: certificate.subject, issuer: certificate.issuer,
        serialNumber: certificate.serialNumber, fingerprintSha256,
        validFrom: new Date(certificate.validFrom), validTo: new Date(certificate.validTo), pem: body.pem,
      }, select: { id: true, name: true, subject: true, issuer: true, serialNumber: true,
        fingerprintSha256: true, validFrom: true, validTo: true, createdAt: true } });
      await tx.auditEvent.create({ data: { identity: req.identity.username, ipAddress: req.ip || 'unknown',
        action: 'certificate.import', resource: record.id, result: 'success',
        correlationId: req.correlationId, details: { fingerprintSha256 } } });
      return { ...record, status: certificateStatus(record.validFrom, record.validTo), inUse: false };
    });
  }

  @Delete(':id')
  async remove(@Req() req: IsmsRequest, @Param('id') id: string) {
    const record = await this.prisma.trustedCaCertificate.findUnique({
      where: { id }, include: { connections: { where: { enabled: true }, select: { id: true } } },
    });
    if (!record) throw new NotFoundException();
    if (record.connections.length > 0) throw new ConflictException('Certificate is used by an active LDAPS connector');
    await this.prisma.$transaction([
      this.prisma.auditEvent.create({ data: { identity: req.identity.username, ipAddress: req.ip || 'unknown',
        action: 'certificate.delete', resource: id, result: 'success', correlationId: req.correlationId } }),
      this.prisma.trustedCaCertificate.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }
}
