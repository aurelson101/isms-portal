import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";

export type StorageTarget = {
  id: string;
  name: string;
  type: "s3" | "smb";
  enabled: boolean;
  revision: string;
  testedAt: string | null;
  testStatus: "untested" | "success" | "failure";
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  forcePathStyle?: boolean;
  mount?: string;
  credentials?: string;
};

const settingPrefix = "document-storage.target.";
export const storageTargetId = (id: string) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      id,
    )
  )
    throw new BadRequestException("Invalid storage target");
  return id;
};
const inputString = (body: Record<string, unknown>, key: string, max = 255) => {
  const value = body[key];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    throw new BadRequestException(`Invalid ${key}`);
  return value.trim();
};
export const storagePath = (value: string) => {
  if (
    !value ||
    value.length > 1024 ||
    !/^[a-zA-Z0-9_./-]+$/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new BadRequestException("Invalid relative storage path");
  return value;
};

@Injectable()
export class StorageTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  publicTarget(target: StorageTarget) {
    const { credentials, ...safe } = target;
    return { ...safe, hasCredentials: !!credentials };
  }

  async list() {
    const rows = await this.prisma.applicationSetting.findMany({
      where: { key: { startsWith: settingPrefix } },
      orderBy: { key: "asc" },
    });
    return rows.map((row) =>
      this.publicTarget(row.value as unknown as StorageTarget),
    );
  }

  async get(id: string) {
    const row = await this.prisma.applicationSetting.findUnique({
      where: { key: settingPrefix + storageTargetId(id) },
    });
    if (!row) throw new NotFoundException("Storage target not found");
    return row.value as unknown as StorageTarget;
  }

  async available() {
    return (await this.list())
      .filter((target) => target.enabled && target.testStatus === "success")
      .map(({ id, name, type }) => ({ id, name, type }));
  }

  async create(body: Record<string, unknown>) {
    const type = body.type;
    if (type !== "s3" && type !== "smb")
      throw new BadRequestException("Choose S3 or SMB");
    const target: StorageTarget = {
      id: randomUUID(),
      name: inputString(body, "name", 80),
      type,
      enabled: false,
      revision: randomUUID(),
      testedAt: null,
      testStatus: "untested",
    };
    if (type === "s3") {
      let endpoint: URL;
      try {
        endpoint = new URL(inputString(body, "endpoint", 512));
      } catch {
        throw new BadRequestException("Invalid S3 endpoint URL");
      }
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== "/"
      )
        throw new BadRequestException(
          "S3 endpoint must be an HTTPS origin without credentials",
        );
      target.endpoint = endpoint.origin;
      target.region = inputString(body, "region", 80);
      target.bucket = inputString(body, "bucket", 63);
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket))
        throw new BadRequestException("Invalid S3 bucket");
      target.prefix = body.prefix
        ? storagePath(inputString(body, "prefix", 256))
        : "";
      if (
        body.forcePathStyle !== undefined &&
        typeof body.forcePathStyle !== "boolean"
      )
        throw new BadRequestException("Invalid path-style option");
      target.forcePathStyle = body.forcePathStyle !== false;
      target.credentials = this.encryptCredentials(body);
    } else {
      target.mount = storagePath(inputString(body, "mount", 255));
    }
    await this.prisma.applicationSetting.create({
      data: {
        key: settingPrefix + target.id,
        value: target as unknown as Prisma.InputJsonValue,
      },
    });
    return this.publicTarget(target);
  }

  private encryptCredentials(body: Record<string, unknown>) {
    return this.crypto.encrypt(
      JSON.stringify({
        accessKeyId: inputString(body, "accessKeyId", 256),
        secretAccessKey: inputString(body, "secretAccessKey", 512),
      }),
    );
  }

  credentials(target: StorageTarget): {
    accessKeyId: string;
    secretAccessKey: string;
  } {
    return JSON.parse(this.crypto.decrypt(target.credentials!));
  }

  async update(id: string, body: Record<string, unknown>) {
    // Destinations are immutable: changing a bucket or mount would orphan existing files.
    if (
      Object.keys(body).some(
        (key) =>
          !["name", "enabled", "accessKeyId", "secretAccessKey"].includes(key),
      )
    )
      throw new BadRequestException(
        "A storage destination cannot be changed; create another target",
      );
    const target = await this.get(id);
    const revision = target.revision;
    if (body.name !== undefined) target.name = inputString(body, "name", 80);
    if (body.accessKeyId || body.secretAccessKey) {
      if (target.type !== "s3")
        throw new BadRequestException(
          "SMB credentials are managed on the server",
        );
      target.credentials = this.encryptCredentials(body);
      target.testStatus = "untested";
      target.testedAt = null;
      target.enabled = false;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean")
        throw new BadRequestException("Invalid enabled option");
      if (body.enabled && target.testStatus !== "success")
        throw new BadRequestException("Test this storage before enabling it");
      target.enabled = body.enabled;
    }
    await this.save(target, revision);
    return this.publicTarget(target);
  }

  async markTest(target: StorageTarget, success: boolean) {
    const revision = target.revision;
    target.testedAt = new Date().toISOString();
    target.testStatus = success ? "success" : "failure";
    if (!success) target.enabled = false;
    await this.save(target, revision);
  }

  private async save(target: StorageTarget, revision: string) {
    target.revision = randomUUID();
    const result = await this.prisma.applicationSetting.updateMany({
      where: {
        key: settingPrefix + target.id,
        value: { path: ["revision"], equals: revision },
      },
      data: { value: target as unknown as Prisma.InputJsonValue },
    });
    if (!result.count)
      throw new ConflictException(
        "Storage configuration changed; refresh and retry",
      );
  }
}
