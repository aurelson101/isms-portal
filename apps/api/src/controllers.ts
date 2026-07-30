import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { createHash, X509Certificate } from 'crypto';
import { ApiTags } from '@nestjs/swagger';
import type { IsmsRequest } from './types';
import { documents, spaces } from './types';
import { AdminOnly } from './security';

const permittedSpaces = (req: IsmsRequest) =>
  spaces.filter((space) => space.groups.some((group) => req.identity.groups.includes(group)));

@Controller('health')
export class HealthController {
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') ready() { return { status: 'ok', checks: { api: 'up' } }; }
}

@ApiTags('identity')
@Controller('me')
export class IdentityController {
  @Get()
  get(@Req() req: IsmsRequest) {
    const adminGroups = (process.env.ISMS_ADMIN_GROUPS || '').split(',');
    return { username: req.identity.username, displayName: req.identity.displayName,
      isAdmin: req.identity.groups.some((g) => adminGroups.includes(g)), spaces: permittedSpaces(req) };
  }
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  @Get()
  list(@Req() req: IsmsRequest, @Query('q') query = '', @Query('category') category?: string) {
    const allowed = new Set(permittedSpaces(req).map((s) => s.slug));
    const q = query.toLocaleLowerCase();
    return documents.filter((doc) => allowed.has(doc.space) && (!category || doc.category === category)
      && (!q || doc.titleFr.toLowerCase().includes(q) || doc.titleEn.toLowerCase().includes(q)));
  }

  @Get(':id')
  one(@Req() req: IsmsRequest, @Param('id') id: string) {
    const doc = documents.find((candidate) => candidate.id === id);
    if (!doc || !permittedSpaces(req).some((space) => space.slug === doc.space)) throw new ForbiddenException();
    return doc;
  }

  @Get(':id/download')
  download(@Req() req: IsmsRequest, @Param('id') id: string) {
    return this.one(req, id);
  }
}

@ApiTags('administration')
@AdminOnly()
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  dashboard() { return { groups: 6, rules: 6, spaces: 5, syncErrors: 0 }; }
  @Get('groups')
  groups() { return ['Domain Users', 'ITAD', 'HRAD', 'FINANCEAD', 'MANAGEMENTAD', 'ISMS-ADMINS']; }
  @Get('access-rules')
  rules() { return spaces.map((space) => ({ space: space.slug, groups: space.groups, read: true, search: true, download: true })); }
}

type CertificateRecord = { id: string; name: string; subject: string; issuer: string; serialNumber: string; fingerprintSha256: string; validFrom: string; validTo: string; pem: string; inUse: boolean };
const certificates: CertificateRecord[] = [];

@ApiTags('certificates')
@AdminOnly()
@Controller('admin/certificates')
export class CertificatesController {
  @Get()
  list() { return certificates.map(({ pem: _pem, ...safe }) => safe); }

  @Post()
  create(@Body() body: { name?: string; pem?: string }) {
    if (!body.name || !body.pem) throw new BadRequestException('name and pem are required');
    if (/PRIVATE KEY/.test(body.pem)) throw new BadRequestException('Private keys are forbidden');
    let certificate: X509Certificate;
    try { certificate = new X509Certificate(body.pem); } catch { throw new BadRequestException('Invalid X.509 certificate'); }
    const fingerprintSha256 = createHash('sha256').update(certificate.raw).digest('hex');
    if (certificates.some((item) => item.fingerprintSha256 === fingerprintSha256)) throw new BadRequestException('Duplicate certificate');
    const record = { id: crypto.randomUUID(), name: body.name, subject: certificate.subject, issuer: certificate.issuer,
      serialNumber: certificate.serialNumber, fingerprintSha256, validFrom: certificate.validFrom, validTo: certificate.validTo,
      pem: body.pem, inUse: false };
    certificates.push(record);
    const { pem: _pem, ...safe } = record;
    return safe;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const index = certificates.findIndex((item) => item.id === id);
    if (index < 0) throw new BadRequestException('Unknown certificate');
    if (certificates[index].inUse) throw new BadRequestException('Certificate is used by an active LDAPS connector');
    certificates.splice(index, 1);
    return { deleted: true };
  }
}

