import {
  Injectable,
  BadRequestException,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { constants } from "fs";
import { access, mkdir, open, rename, rm, stat, statfs, lstat, realpath } from "fs/promises";
import { createReadStream } from "fs";
import { dirname, resolve, sep } from "path";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { StorageTargetsService, storagePath, storageTargetId, type StorageTarget } from "./storage-targets.service";

@Injectable()
export class StorageService implements OnModuleInit {
  constructor(private readonly targets: StorageTargetsService) {}

  private readonly root = resolve(
    process.env.DOCUMENT_STORAGE_PATH || "/data/documents",
  );

  async onModuleInit() {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o750 });
      await access(this.root, constants.R_OK | constants.W_OK);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Document storage initialization failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private pathFor(objectKey: string, root = this.root) {
    storagePath(objectKey);
    const target = resolve(root, objectKey);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new Error("Invalid document storage key");
    }
    return target;
  }

  async uploadKey(key: string, targetId?: string) {
    storagePath(key);
    if (!targetId || targetId === "primary") return key;
    const target = await this.targets.get(targetId);
    if (!target.enabled || target.testStatus !== "success") throw new BadRequestException("Storage target is not available for uploads");
    return `targets/${target.id}/${key}`;
  }

  derivedKey(sourceKey: string, key: string) {
    storagePath(key);
    const targetId = sourceKey.startsWith("targets/") ? storageTargetId(sourceKey.split("/")[1]) : null;
    return targetId ? `targets/${targetId}/${key}` : key;
  }

  private async destination(objectKey: string) {
    storagePath(objectKey);
    if (!objectKey.startsWith("targets/")) return { key: objectKey, target: null };
    const [, id, ...parts] = objectKey.split("/");
    const target = await this.targets.get(id);
    return { target, key: storagePath(parts.join("/")) };
  }

  private s3(target: StorageTarget) {
    return new S3Client({
      endpoint: target.endpoint, region: target.region,
      forcePathStyle: target.forcePathStyle,
      credentials: this.targets.credentials(target), maxAttempts: 2,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
    });
  }

  private s3Location(target: StorageTarget, key: string) {
    return { Bucket: target.bucket!, Key: target.prefix ? `${target.prefix}/${key}` : key };
  }

  private async localPath(key: string, target: StorageTarget | null) {
    let root = this.root;
    if (target) {
      const base = resolve(process.env.DOCUMENT_SMB_ROOT || "/data/smb");
      root = this.pathFor(target.mount!, base);
      // Refuse a missing share instead of silently writing onto the Docker disk.
      if ((await realpath(root)) !== root || (Number((await statfs(root)).type) >>> 0) !== 0xff534d42)
        throw new ServiceUnavailableException("SMB/CIFS share is not mounted");
    }
    const path = this.pathFor(key, root);
    let current = root;
    for (const part of key.split("/")) {
      current = resolve(current, part);
      const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (info?.isSymbolicLink()) throw new BadRequestException("Storage symlinks are not allowed");
    }
    return path;
  }

  async healthCheck() {
    try {
      await access(this.root, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async putObject(
    objectKey: string,
    content: Buffer,
    metadata: Record<string, string>,
  ) {
    const destination = await this.destination(objectKey);
    if (destination.target?.type === "s3") {
      const client = this.s3(destination.target);
      try {
        await client.send(new PutObjectCommand({
          ...this.s3Location(destination.target, destination.key), Body: content,
          ContentType: metadata["Content-Type"] || "application/octet-stream",
          Metadata: metadata["X-Amz-Meta-Sha256"] ? { sha256: metadata["X-Amz-Meta-Sha256"] } : undefined,
        }));
      } finally { client.destroy(); }
      return;
    }
    const target = await this.localPath(destination.key, destination.target);
    await mkdir(dirname(target), { recursive: true, mode: 0o750 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o640);
    try {
      await file.writeFile(content);
      await file.sync();
      await file.close();
      await rename(temporary, target);
    } catch (error) {
      await file.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async getObject(objectKey: string): Promise<Readable> {
    const destination = await this.destination(objectKey);
    if (destination.target?.type === "s3") {
      const client = this.s3(destination.target);
      try {
        const response = await client.send(new GetObjectCommand(this.s3Location(destination.target, destination.key)));
        const stream = response.Body as Readable | undefined;
        if (!stream) throw new ServiceUnavailableException("Empty storage response");
        stream.once("close", () => client.destroy());
        return stream;
      } catch (error) { client.destroy(); throw error; }
    }
    const target = await this.localPath(destination.key, destination.target);
    await access(target, constants.R_OK);
    return createReadStream(target);
  }

  async getBuffer(objectKey: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await this.getObject(objectKey)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async statObject(objectKey: string) {
    const destination = await this.destination(objectKey);
    if (destination.target?.type === "s3") {
      const client = this.s3(destination.target);
      try {
        const info = await client.send(new HeadObjectCommand(this.s3Location(destination.target, destination.key)));
        return { size: info.ContentLength || 0 };
      } finally { client.destroy(); }
    }
    return stat(await this.localPath(destination.key, destination.target));
  }

  async diskMetrics() {
    const stats = await statfs(this.root);
    return {
      availableBytes: Number(stats.bavail) * Number(stats.bsize),
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
    };
  }

  async removeObject(objectKey: string) {
    const destination = await this.destination(objectKey);
    if (destination.target?.type === "s3") {
      const client = this.s3(destination.target);
      try { await client.send(new DeleteObjectCommand(this.s3Location(destination.target, destination.key))); }
      finally { client.destroy(); }
      return;
    }
    await rm(await this.localPath(destination.key, destination.target), { force: true });
  }

  async testTarget(id: string) {
    const target = await this.targets.get(id);
    const key = `targets/${target.id}/.isms-tests/${randomUUID()}`;
    const content = Buffer.from(randomUUID());
    let success = false;
    try {
      await this.putObject(key, content, {});
      if (!(await this.getBuffer(key)).equals(content)) throw new Error("Storage verification failed");
      await this.removeObject(key);
      success = true;
    } catch {
      await this.removeObject(key).catch(() => undefined);
    }
    await this.targets.markTest(target, success);
    return { success, testedAt: target.testedAt };
  }
}
