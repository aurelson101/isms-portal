import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from "crypto";
import { promisify } from "util";
import { isIP } from "net";
import type { Response } from "express";
import { PrismaService } from "./prisma.service";
import { DirectoryService } from "./directory.service";
import type { Identity, IsmsRequest } from "./types";

const scrypt = promisify(scryptCallback);
const adminCookieName = "isms_admin_session";
const directoryCookieName = "isms_directory_session";
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const decodeBase32 = (value: string) => {
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");
    bits += index.toString(2).padStart(5, "0");
  }
  return Buffer.from(
    (bits.match(/.{8}/gu) || []).map((byte) => Number.parseInt(byte, 2)),
  );
};

const encodeBase32 = (value: Buffer) => {
  const bits = [...value]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");
  return (bits.match(/.{1,5}/gu) || [])
    .map((part) => base32Alphabet[Number.parseInt(part.padEnd(5, "0"), 2)])
    .join("");
};

const totp = (secret: string, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly activityTouchIntervalMs = 5 * 60 * 1000;

  private activityTouchDue(lastActivityAt?: Date | null) {
    return (
      !lastActivityAt ||
      Date.now() - lastActivityAt.getTime() >= this.activityTouchIntervalMs
    );
  }

  private readonly logger = new Logger(AuthService.name);
  private readonly ssoDirectoryCache = new Map<
    string,
    {
      expiresAt: number;
      profile: Awaited<ReturnType<DirectoryService["resolveUserByMail"]>>;
    }
  >();
  private readonly ssoDirectoryInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<DirectoryService["resolveUserByMail"]>>>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
  ) {}

  async onModuleInit() {
    await Promise.all([
      this.prisma.directoryUserSession.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      }),
      this.prisma.adminSession.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      }),
    ]);
    const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!username || !password) return;
    if (password.length < 14)
      throw new Error("INITIAL_ADMIN_PASSWORD must contain at least 14 chars");
    const existing = await this.prisma.adminAccount.findFirst({
      where: { primary: true },
    });
    if (!existing) {
      await this.prisma.adminAccount.create({
        data: {
          username,
          displayName:
            process.env.INITIAL_ADMIN_DISPLAY_NAME || "Administrateur",
          passwordHash: await this.hashPassword(password),
          primary: true,
        },
      });
    }
  }

  async hashPassword(password: string) {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
  }

  async verifyPassword(password: string, encoded?: string | null) {
    if (!encoded) return false;
    const [algorithm, saltValue, hashValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64");
    const actual = (await scrypt(
      password,
      Buffer.from(saltValue, "base64"),
      expected.length,
    )) as Buffer;
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private cookie(request: IsmsRequest, name: string) {
    const raw = request.headers.cookie || "";
    return raw
      .split(";")
      .map((part) => part.trim().split("="))
      .find(([cookieName]) => cookieName === name)?.[1];
  }

  async sessionIdentity(
    request: IsmsRequest,
    refreshDirectoryGroups = false,
  ): Promise<Identity | null> {
    const adminIdentity = await this.adminSessionIdentity(request);
    if (adminIdentity) return adminIdentity;
    const directoryToken = this.cookie(request, directoryCookieName);
    if (!directoryToken) return null;
    const session = await this.prisma.directoryUserSession.findUnique({
      where: { tokenHash: hashToken(directoryToken) },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    let refreshedProfile: Awaited<
      ReturnType<DirectoryService["resolveUserByMail"]>
    > = null;
    let directoryRefreshCompleted = false;
    if (refreshDirectoryGroups) {
      try {
        refreshedProfile = await this.directory.resolveUserByMail(
          session.username,
        );
        directoryRefreshCompleted = true;
      } catch {
        this.logger.warn(
          "Directory session refresh failed; retaining the last known groups",
        );
      }
    }
    const storedGroups = Array.isArray(session.groups)
      ? session.groups.filter(
          (group): group is string => typeof group === "string",
        )
      : [];
    const groups = refreshedProfile
      ? refreshedProfile.groups
      : refreshDirectoryGroups && directoryRefreshCompleted
        ? []
        : storedGroups;
    if (refreshDirectoryGroups || this.activityTouchDue(session.lastUsedAt)) {
      await this.prisma.directoryUserSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          ...(refreshedProfile
            ? {
                username: refreshedProfile.username,
                displayName: refreshedProfile.displayName,
                groups: refreshedProfile.groups,
                directoryConnectionId: refreshedProfile.connectionId,
              }
            : directoryRefreshCompleted
              ? { groups: [] }
              : {}),
        },
      });
    }
    return this.enrichSsoIdentity({
      username: refreshedProfile?.username || session.username,
      displayName: refreshedProfile?.displayName || session.displayName,
      groups,
      source: "directory-session",
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  }

  async adminSessionIdentity(request: IsmsRequest): Promise<Identity | null> {
    const adminToken = this.cookie(request, adminCookieName);
    if (adminToken) {
      const session = await this.prisma.adminSession.findUnique({
        where: { tokenHash: hashToken(adminToken) },
        include: { adminAccount: true },
      });
      if (
        session &&
        session.expiresAt > new Date() &&
        session.adminAccount.active &&
        (!session.adminAccount.validFrom ||
          session.adminAccount.validFrom <= new Date()) &&
        (!session.adminAccount.validUntil ||
          session.adminAccount.validUntil > new Date())
      ) {
        await Promise.all([
          this.prisma.adminSession.update({
            where: { id: session.id },
            data: { lastUsedAt: new Date() },
          }),
          this.activityTouchDue(session.adminAccount.lastAuthorizedAt)
            ? this.prisma.adminAccount.update({
                where: { id: session.adminAccount.id },
                data: { lastAuthorizedAt: new Date() },
              })
            : Promise.resolve(),
        ]);
        return {
          username: session.adminAccount.username,
          displayName: session.adminAccount.displayName,
          groups: ["ISMS-LOCAL-ADMINS"],
          source: "local-admin",
          sessionExpiresAt: session.expiresAt.toISOString(),
          profilePhoto: session.adminAccount.profilePhoto,
        };
      }
    }
    return null;
  }

  async enrichSsoIdentity(identity: Identity, forceDirectoryRefresh = false) {
    let enrichedIdentity = identity;
    if (
      identity.source === "trusted-proxy" &&
      process.env.SSO_DIRECTORY_GROUP_ENRICHMENT !== "false"
    ) {
      const profile = await this.ssoDirectoryProfile(
        identity.username,
        forceDirectoryRefresh,
      );
      if (profile)
        enrichedIdentity = {
          ...identity,
          username: profile.username,
          displayName: profile.displayName || identity.displayName,
          groups: [...new Set([...identity.groups, ...profile.groups])],
        };
    }
    const [account, administratorGroup] = await Promise.all([
      this.prisma.adminAccount.findFirst({
        where: {
          username: {
            equals: enrichedIdentity.username,
            mode: "insensitive",
          },
          source: "DIRECTORY",
          active: true,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
          ],
        },
      }),
      enrichedIdentity.groups.length
        ? this.prisma.adminDirectoryGroup.findFirst({
            where: {
              active: true,
              AND: [
                {
                  OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }],
                },
                {
                  OR: [
                    { validUntil: null },
                    { validUntil: { gt: new Date() } },
                  ],
                },
              ],
              OR: enrichedIdentity.groups.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
          })
        : Promise.resolve(null),
    ]);
    if (account || administratorGroup) {
      await Promise.all([
        account && this.activityTouchDue(account.lastAuthorizedAt)
          ? this.prisma.adminAccount.update({
              where: { id: account.id },
              data: { lastAuthorizedAt: new Date() },
            })
          : Promise.resolve(),
        administratorGroup &&
        this.activityTouchDue(administratorGroup.lastAuthorizedAt)
          ? this.prisma.adminDirectoryGroup.update({
              where: { id: administratorGroup.id },
              data: { lastAuthorizedAt: new Date() },
            })
          : Promise.resolve(),
      ]);
    }
    return account || administratorGroup
      ? {
          ...enrichedIdentity,
          displayName: account?.displayName || enrichedIdentity.displayName,
          profilePhoto: account?.profilePhoto,
          groups: [
            ...new Set([...enrichedIdentity.groups, "ISMS-LOCAL-ADMINS"]),
          ],
        }
      : enrichedIdentity;
  }

  private boundedSeconds(value: string | undefined, fallback: number) {
    return Math.min(3600, Math.max(5, Number(value || fallback) || fallback));
  }

  private rememberSsoDirectoryProfile(
    username: string,
    profile: Awaited<ReturnType<DirectoryService["resolveUserByMail"]>>,
  ) {
    const ttlSeconds = profile
      ? this.boundedSeconds(process.env.SSO_DIRECTORY_CACHE_TTL_SECONDS, 300)
      : this.boundedSeconds(
          process.env.SSO_DIRECTORY_NEGATIVE_CACHE_TTL_SECONDS,
          30,
        );
    this.ssoDirectoryCache.delete(username);
    while (this.ssoDirectoryCache.size >= 10_000) {
      const oldest = this.ssoDirectoryCache.keys().next().value;
      if (!oldest) break;
      this.ssoDirectoryCache.delete(oldest);
    }
    this.ssoDirectoryCache.set(username, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      profile,
    });
  }

  private async ssoDirectoryProfile(username: string, forceRefresh = false) {
    if (forceRefresh) this.ssoDirectoryCache.delete(username);
    const cached = this.ssoDirectoryCache.get(username);
    if (cached && cached.expiresAt > Date.now()) {
      this.ssoDirectoryCache.delete(username);
      this.ssoDirectoryCache.set(username, cached);
      return cached.profile;
    }
    if (cached) this.ssoDirectoryCache.delete(username);
    const existing = this.ssoDirectoryInFlight.get(username);
    if (existing) return existing;
    const lookup = this.directory
      .resolveUserByMail(username)
      .catch(() => {
        this.logger.warn(
          "SSO directory enrichment failed; access remains deny-by-default",
        );
        return null;
      })
      .then((profile) => {
        this.rememberSsoDirectoryProfile(username, profile);
        return profile;
      })
      .finally(() => this.ssoDirectoryInFlight.delete(username));
    this.ssoDirectoryInFlight.set(username, lookup);
    return lookup;
  }

  async login(
    username: string,
    password: string,
    mfaCode: string | undefined,
    response: Response,
    request: IsmsRequest,
  ) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username },
    });
    if (account?.lockedUntil && account.lockedUntil > new Date())
      throw new UnauthorizedException("Account temporarily locked");
    const valid =
      account?.source === "LOCAL" &&
      account.active &&
      (!account.validFrom || account.validFrom <= new Date()) &&
      (!account.validUntil || account.validUntil > new Date()) &&
      (await this.verifyPassword(password, account.passwordHash));
    if (!valid) {
      if (account?.source === "LOCAL") {
        const failedLoginCount = account.failedLoginCount + 1;
        await this.prisma.adminAccount.update({
          where: { id: account.id },
          data: {
            failedLoginCount: failedLoginCount >= 5 ? 0 : failedLoginCount,
            lockedUntil:
              failedLoginCount >= 5
                ? new Date(Date.now() + 15 * 60 * 1000)
                : null,
          },
        });
      } else {
        await this.hashPassword(password);
      }
      throw new UnauthorizedException("Invalid credentials");
    }
    if (
      account.mfaEnabled &&
      (!mfaCode || !this.verifyTotp(account.mfaSecret || "", mfaCode))
    )
      throw new UnauthorizedException("MFA code required or invalid");
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await this.prisma.adminSession.create({
      data: {
        tokenHash: hashToken(token),
        adminAccountId: account.id,
        expiresAt,
        sourceIp: this.clientIp(request),
      },
    });
    response.cookie(adminCookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      expires: expiresAt,
    });
    return { authenticated: true, mfaEnabled: account.mfaEnabled };
  }

  private clientIp(request: IsmsRequest) {
    const realIp = request.headers["x-real-ip"];
    const candidate =
      (typeof realIp === "string" ? realIp.trim() : "") ||
      request.socket.remoteAddress ||
      "";
    const normalized = candidate.startsWith("::ffff:")
      ? candidate.slice(7)
      : candidate;
    return isIP(normalized) ? normalized : null;
  }

  async directoryLogin(
    login: string,
    password: string,
    response: Response,
    rememberDevice = false,
  ) {
    const identity = await this.directory.authenticateUser(login, password);
    await this.reconcileDirectoryAdministratorIdentity(
      login,
      identity.username,
    );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() +
        (rememberDevice ? 14 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000),
    );
    await this.prisma.directoryUserSession.create({
      data: {
        tokenHash: hashToken(token),
        username: identity.username,
        displayName: identity.displayName,
        groups: identity.groups,
        directoryConnectionId: identity.connectionId,
        expiresAt,
      },
    });
    response.cookie(directoryCookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      expires: expiresAt,
    });
    return { authenticated: true, destination: "/" };
  }

  private async reconcileDirectoryAdministratorIdentity(
    loginValue: string,
    canonicalUsername: string,
  ) {
    const login = loginValue.trim();
    const canonical = canonicalUsername.trim().toLowerCase();
    if (!login || !canonical || login.toLowerCase() === canonical) return;
    const [legacyAccount, canonicalAccount] = await Promise.all([
      this.prisma.adminAccount.findFirst({
        where: {
          username: { equals: login, mode: "insensitive" },
          source: "DIRECTORY",
        },
      }),
      this.prisma.adminAccount.findFirst({
        where: {
          username: { equals: canonical, mode: "insensitive" },
          source: "DIRECTORY",
        },
      }),
    ]);
    if (legacyAccount && !canonicalAccount)
      await this.prisma.adminAccount.update({
        where: { id: legacyAccount.id },
        data: { username: canonical },
      });
  }

  async directoryLoginEnabled() {
    return Boolean(
      await this.prisma.directoryConnection.findFirst({
        where: { enabled: true },
        select: { id: true },
      }),
    );
  }

  async logout(
    request: IsmsRequest,
    response: Response,
    requestedScope?: string,
  ) {
    const scope = ["admin", "user"].includes(requestedScope || "")
      ? requestedScope
      : "all";
    const adminToken = this.cookie(request, adminCookieName);
    if (adminToken && scope !== "user")
      await this.prisma.adminSession.deleteMany({
        where: { tokenHash: hashToken(adminToken) },
      });
    const directoryToken = this.cookie(request, directoryCookieName);
    if (directoryToken && scope !== "admin")
      await this.prisma.directoryUserSession.deleteMany({
        where: { tokenHash: hashToken(directoryToken) },
      });
    if (scope !== "user") response.clearCookie(adminCookieName, { path: "/" });
    if (scope !== "admin")
      response.clearCookie(directoryCookieName, { path: "/" });
    return { authenticated: false };
  }

  newMfaSecret() {
    return encodeBase32(randomBytes(20));
  }

  verifyTotp(secret: string, code: string) {
    if (!/^\d{6}$/u.test(code)) return false;
    return [-30_000, 0, 30_000].some((offset) =>
      timingSafeEqual(
        Buffer.from(totp(secret, Date.now() + offset)),
        Buffer.from(code),
      ),
    );
  }
}
