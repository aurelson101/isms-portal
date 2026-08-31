import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { AdminOnly } from "./security";
import { AuthService } from "./auth.service";
import { PrismaService } from "./prisma.service";
import { AuditService } from "./audit.service";
import { DirectoryService } from "./directory.service";
import { SensitiveApprovalService } from "./sensitive-approval.service";
import type { IsmsRequest } from "./types";
import {
  AdminActiveDto,
  ChangePasswordDto,
  CreateAdminDirectoryGroupDto,
  CreateAdminDto,
  DirectoryLoginDto,
  LoginDto,
  MfaConfirmDto,
  ProfileDto,
} from "./admin.dto";
import { safeSsoPath } from "./http-security";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("config")
  async config() {
    const ssoLoginUrl = safeSsoPath(process.env.SSO_LOGIN_URL);
    return {
      ssoEnabled: Boolean(ssoLoginUrl),
      ssoLoginUrl,
      directoryLoginEnabled: await this.auth.directoryLoginEnabled(),
      localAdminEnabled: true,
    };
  }

  @Post("directory-login")
  directoryLogin(
    @Body() body: DirectoryLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.directoryLogin(
      body.login,
      body.password,
      response,
      body.rememberDevice,
    );
  }

  @Post("login")
  login(
    @Req() request: IsmsRequest,
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(
      body.username.trim(),
      body.password,
      body.mfaCode,
      response,
      request,
    );
  }

  @Post("logout")
  logout(
    @Req() request: IsmsRequest,
    @Res({ passthrough: true }) response: Response,
    @Query("scope") scope?: string,
  ) {
    return this.auth.logout(request, response, scope);
  }
}

@AdminOnly()
@Controller("admin/accounts")
export class AdminAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
    private readonly sensitiveApprovals: SensitiveApprovalService,
  ) {}

  private lifecycle(validUntil?: string, validFrom?: string) {
    if (validFrom && !validUntil)
      throw new BadRequestException(
        "A privilege starting in the future requires an expiry",
      );
    const start = validFrom ? new Date(validFrom) : null;
    const expiry = validUntil ? new Date(validUntil) : null;
    if (expiry && expiry <= new Date())
      throw new BadRequestException("Privilege expiry must be in the future");
    if (start && expiry && expiry <= start)
      throw new BadRequestException("Privilege expiry must follow its start");
    const reviewedAt = new Date();
    return {
      validFrom: start,
      validUntil: expiry,
      lastReviewedAt: reviewedAt,
      reviewDueAt: new Date(reviewedAt.getTime() + 180 * 24 * 60 * 60 * 1000),
    };
  }

  @Get("directory-users/:query")
  async directoryUsers(@Param("query") query: string) {
    return this.directory.searchUsers(query);
  }

  @Get("directory-groups/:query")
  async directoryGroups(@Param("query") query: string) {
    return this.directory.searchGroups(query);
  }

  @Get("groups")
  async groups() {
    return this.prisma.adminDirectoryGroup.findMany({
      orderBy: { name: "asc" },
    });
  }

  @Post("groups")
  async addGroup(
    @Req() request: IsmsRequest,
    @Body() body: CreateAdminDirectoryGroupDto,
  ) {
    const matches = await this.directory.searchGroups(body.name);
    const selected = matches.find(
      (group) =>
        group.name.toLowerCase() === body.name.trim().toLowerCase() &&
        group.distinguishedName.toLowerCase() ===
          body.distinguishedName.trim().toLowerCase(),
    );
    if (!selected)
      throw new BadRequestException("The AD group could not be verified");
    const warningThreshold = Math.max(
      1,
      Number(process.env.ADMIN_GROUP_WARNING_THRESHOLD) || 100,
    );
    if (selected.memberCount > warningThreshold && !body.largeGroupConfirmed)
      throw new BadRequestException(
        `Large AD group confirmation required (${selected.memberCount} members)`,
      );
    const existing = await this.prisma.adminDirectoryGroup.findFirst({
      where: {
        OR: [
          { name: { equals: selected.name, mode: "insensitive" } },
          {
            distinguishedName: {
              equals: selected.distinguishedName,
              mode: "insensitive",
            },
          },
        ],
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException("AD admin group already exists");
    const approvalId = await this.sensitiveApprovals.require(
      request,
      "BROAD_PRIVILEGE",
      "ADMIN_DIRECTORY_GROUP",
      selected.distinguishedName.toLowerCase(),
      body.justification.trim(),
    );
    const group = await this.prisma.adminDirectoryGroup.create({
      data: {
        name: selected.name,
        distinguishedName: selected.distinguishedName,
        justification: body.justification.trim(),
        ...this.lifecycle(body.validUntil, body.validFrom),
      },
    });
    await this.audit.record(
      request,
      "admin-directory-group.create",
      `admin-directory-group:${group.id}`,
      "success",
    );
    await this.sensitiveApprovals.execute(approvalId);
    return group;
  }

  @Delete("groups/:id")
  async removeGroup(@Req() request: IsmsRequest, @Param("id") id: string) {
    const group = await this.prisma.adminDirectoryGroup.findUnique({
      where: { id },
    });
    if (!group) throw new NotFoundException();
    await this.prisma.adminDirectoryGroup.delete({ where: { id } });
    await this.audit.record(
      request,
      "admin-directory-group.delete",
      `admin-directory-group:${id}`,
      "success",
    );
    return { deleted: true };
  }

  @Put("groups/:id/review")
  async reviewGroup(@Req() request: IsmsRequest, @Param("id") id: string) {
    const reviewedAt = new Date();
    const group = await this.prisma.adminDirectoryGroup.update({
      where: { id },
      data: {
        lastReviewedAt: reviewedAt,
        reviewDueAt: new Date(reviewedAt.getTime() + 180 * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.record(
      request,
      "admin-directory-group.review",
      `admin-directory-group:${id}`,
      "success",
    );
    return group;
  }

  @Get()
  list() {
    return this.prisma.adminAccount.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        source: true,
        profilePhoto: true,
        mfaEnabled: true,
        active: true,
        primary: true,
        justification: true,
        validUntil: true,
        validFrom: true,
        lastAuthorizedAt: true,
        lastReviewedAt: true,
        reviewDueAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ primary: "desc" }, { displayName: "asc" }],
    });
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: CreateAdminDto) {
    if (body.source === "LOCAL" && !body.password)
      throw new BadRequestException("A password is required for a local admin");
    const approvalId = await this.sensitiveApprovals.require(
      req,
      "BROAD_PRIVILEGE",
      "ADMIN_ACCOUNT",
      body.username.trim().toLowerCase(),
      body.justification.trim(),
    );
    const account = await this.prisma.adminAccount.create({
      data: {
        username: body.username.trim(),
        displayName: body.displayName.trim(),
        source: body.source,
        justification: body.justification.trim(),
        ...this.lifecycle(body.validUntil, body.validFrom),
        passwordHash:
          body.source === "LOCAL"
            ? await this.auth.hashPassword(body.password!)
            : null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        source: true,
        mfaEnabled: true,
        active: true,
        primary: true,
      },
    });
    await this.audit.record(
      req,
      "admin-account.create",
      `admin:${account.id}`,
      "success",
    );
    await this.sensitiveApprovals.execute(approvalId);
    return account;
  }

  @Put(":id/review")
  async reviewAccount(@Req() request: IsmsRequest, @Param("id") id: string) {
    const reviewedAt = new Date();
    const account = await this.prisma.adminAccount.update({
      where: { id },
      data: {
        lastReviewedAt: reviewedAt,
        reviewDueAt: new Date(reviewedAt.getTime() + 180 * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.record(
      request,
      "admin-account.review",
      `admin:${id}`,
      "success",
    );
    return account;
  }

  @Get("sessions/active")
  async sessions() {
    return this.prisma.adminSession.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        sourceIp: true,
        userAgent: true,
        adminAccount: {
          select: { username: true, displayName: true, source: true },
        },
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  @Delete("sessions/:id")
  async revokeSession(@Req() request: IsmsRequest, @Param("id") id: string) {
    const session = await this.prisma.adminSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!session) throw new NotFoundException();
    await this.prisma.adminSession.delete({ where: { id } });
    await this.audit.record(
      request,
      "admin-session.revoke",
      `admin-session:${id}`,
      "success",
    );
    return { revoked: true };
  }

  @Put("me/profile")
  async profile(@Req() req: IsmsRequest, @Body() body: ProfileDto) {
    if (
      body.profilePhoto &&
      !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/iu.test(
        body.profilePhoto,
      )
    )
      throw new BadRequestException("Invalid profile image");
    const account = await this.prisma.adminAccount.update({
      where: { username: req.identity.username },
      data: {
        displayName: body.displayName.trim(),
        profilePhoto: body.profilePhoto || null,
      },
      select: { username: true, displayName: true, profilePhoto: true },
    });
    await this.audit.record(
      req,
      "admin-account.profile",
      "admin:self",
      "success",
    );
    return account;
  }

  @Put("me/password")
  async password(@Req() req: IsmsRequest, @Body() body: ChangePasswordDto) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username: req.identity.username },
    });
    if (
      !account ||
      !(await this.auth.verifyPassword(
        body.currentPassword,
        account.passwordHash,
      ))
    )
      throw new BadRequestException("Current password is invalid");
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { passwordHash: await this.auth.hashPassword(body.newPassword) },
    });
    await this.prisma.adminSession.deleteMany({
      where: { adminAccountId: account.id },
    });
    await this.audit.record(
      req,
      "admin-account.password",
      "admin:self",
      "success",
    );
    return { changed: true, loginRequired: true };
  }

  @Post("me/mfa/setup")
  async setupMfa(@Req() req: IsmsRequest) {
    const secret = this.auth.newMfaSecret();
    await this.prisma.adminAccount.update({
      where: { username: req.identity.username },
      data: { mfaSecret: secret, mfaEnabled: false },
    });
    const issuer = encodeURIComponent("ISMS Portal");
    const label = encodeURIComponent(req.identity.username);
    return {
      secret,
      otpauthUrl: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
    };
  }

  @Post("me/mfa/confirm")
  async confirmMfa(@Req() req: IsmsRequest, @Body() body: MfaConfirmDto) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username: req.identity.username },
    });
    if (
      !account?.mfaSecret ||
      !this.auth.verifyTotp(account.mfaSecret, body.code)
    )
      throw new BadRequestException("Invalid MFA code");
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { mfaEnabled: true },
    });
    await this.audit.record(
      req,
      "admin-account.mfa-enable",
      "admin:self",
      "success",
    );
    return { enabled: true };
  }

  @Delete("me/mfa")
  async disableMfa(@Req() req: IsmsRequest) {
    await this.prisma.adminAccount.update({
      where: { username: req.identity.username },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    await this.audit.record(
      req,
      "admin-account.mfa-disable",
      "admin:self",
      "success",
    );
    return { enabled: false };
  }

  @Delete(":id")
  async remove(@Req() req: IsmsRequest, @Param("id") id: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException();
    if (account.primary)
      throw new BadRequestException(
        "The primary administrator cannot be removed",
      );
    await this.prisma.adminAccount.delete({ where: { id } });
    await this.audit.record(
      req,
      "admin-account.delete",
      `admin:${id}`,
      "success",
    );
    return { deleted: true };
  }

  @Put(":id/active")
  async setActive(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: AdminActiveDto,
  ) {
    const existing = await this.prisma.adminAccount.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (existing.primary && !body.active)
      throw new BadRequestException(
        "The primary administrator cannot be disabled",
      );
    const account = await this.prisma.adminAccount.update({
      where: { id },
      data: { active: body.active },
      select: { id: true, username: true, active: true },
    });
    if (!body.active)
      await this.prisma.adminSession.deleteMany({
        where: { adminAccountId: id },
      });
    await this.audit.record(
      req,
      body.active ? "admin-account.enable" : "admin-account.disable",
      `admin:${id}`,
      "success",
    );
    return account;
  }
}
