import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { constants } from 'fs';
import { access, mkdir, open, rename, rm, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { dirname, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root = resolve(process.env.DOCUMENT_STORAGE_PATH || '/data/documents');

  async onModuleInit() {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o750 });
      await access(this.root, constants.R_OK | constants.W_OK);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Document storage initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private pathFor(objectKey: string) {
    const target = resolve(this.root, objectKey);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('Invalid document storage key');
    }
    return target;
  }

  async healthCheck() {
    try {
      await access(this.root, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async putObject(objectKey: string, content: Buffer, _metadata: Record<string, string>) {
    const target = this.pathFor(objectKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o750 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o640);
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
    const target = this.pathFor(objectKey);
    await access(target, constants.R_OK);
    return createReadStream(target);
  }

  statObject(objectKey: string) {
    return stat(this.pathFor(objectKey));
  }

  async removeObject(objectKey: string) {
    await rm(this.pathFor(objectKey), { force: true });
  }
}
