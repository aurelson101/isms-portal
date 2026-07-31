import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
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
import type { IsmsRequest } from "./types";
import {
  ChangePasswordDto,
  CreateAdminDto,
  DirectoryLoginDto,
  LoginDto,
  MfaConfirmDto,
  ProfileDto,
} from "./admin.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("config")
  async config() {
    return {
      ssoEnabled: Boolean(process.env.SSO_LOGIN_URL),
      ssoLoginUrl: process.env.SSO_LOGIN_URL || null,
      directoryLoginEnabled: await this.auth.directoryLoginEnabled(),
      localAdminEnabled: true,
    };
  }

  @Post("directory-login")
  directoryLogin(
    @Body() body: DirectoryLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.directoryLogin(body.login, body.password, response);
  }

  @Post("login")
  login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(
      body.username.trim(),
      body.password,
      body.mfaCode,
      response,
    );
  }

  @Post("logout")
  logout(
    @Req() request: IsmsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(request, response);
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
  ) {}

  private async ensurePrimary(request: IsmsRequest) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username: request.identity.username },
      select: { primary: true },
    });
    if (!account?.primary)
      throw new BadRequestException(
        "Only the primary administrator can manage administrators",
      );
  }

  @Get("directory-users/:query")
  async directoryUsers(
    @Req() request: IsmsRequest,
    @Param("query") query: string,
  ) {
    await this.ensurePrimary(request);
    return this.directory.searchUsers(query);
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
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ primary: "desc" }, { displayName: "asc" }],
    });
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: CreateAdminDto) {
    await this.ensurePrimary(req);
    if (body.source === "LOCAL" && !body.password)
      throw new BadRequestException("A password is required for a local admin");
    const account = await this.prisma.adminAccount.create({
      data: {
        username: body.username.trim(),
        displayName: body.displayName.trim(),
        source: body.source,
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
    return account;
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
    await this.ensurePrimary(req);
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
}
