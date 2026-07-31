import {
  Injectable,
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
import type { Response } from "express";
import { PrismaService } from "./prisma.service";
import type { Identity, IsmsRequest } from "./types";

const scrypt = promisify(scryptCallback);
const cookieName = "isms_admin_session";
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
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
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

  private cookie(request: IsmsRequest) {
    const raw = request.headers.cookie || "";
    return raw
      .split(";")
      .map((part) => part.trim().split("="))
      .find(([name]) => name === cookieName)?.[1];
  }

  async sessionIdentity(request: IsmsRequest): Promise<Identity | null> {
    const token = this.cookie(request);
    if (!token) return null;
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { adminAccount: true },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !session.adminAccount.active
    )
      return null;
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      username: session.adminAccount.username,
      displayName: session.adminAccount.displayName,
      groups: ["ISMS-LOCAL-ADMINS"],
      source: "local-admin",
      sessionExpiresAt: session.expiresAt.toISOString(),
      profilePhoto: session.adminAccount.profilePhoto,
    };
  }

  async enrichSsoIdentity(identity: Identity) {
    const account = await this.prisma.adminAccount.findFirst({
      where: {
        username: { equals: identity.username, mode: "insensitive" },
        source: "DIRECTORY",
        active: true,
      },
    });
    return account
      ? {
          ...identity,
          displayName: account.displayName || identity.displayName,
          profilePhoto: account.profilePhoto,
          groups: [...new Set([...identity.groups, "ISMS-LOCAL-ADMINS"])],
        }
      : identity;
  }

  async login(
    username: string,
    password: string,
    mfaCode: string | undefined,
    response: Response,
  ) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username },
    });
    if (account?.lockedUntil && account.lockedUntil > new Date())
      throw new UnauthorizedException("Account temporarily locked");
    const valid =
      account?.source === "LOCAL" &&
      account.active &&
      (await this.verifyPassword(password, account.passwordHash));
    if (!valid) {
      if (account) {
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
      },
    });
    response.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      expires: expiresAt,
    });
    return { authenticated: true, mfaEnabled: account.mfaEnabled };
  }

  async logout(request: IsmsRequest, response: Response) {
    const token = this.cookie(request);
    if (token)
      await this.prisma.adminSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    response.clearCookie(cookieName, { path: "/" });
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
