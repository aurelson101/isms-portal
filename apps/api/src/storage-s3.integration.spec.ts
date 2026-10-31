import "reflect-metadata";
import { expect, it } from "vitest";
import { randomUUID } from "crypto";
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { StorageService } from "./storage.service";
import type { StorageTarget } from "./storage-targets.service";

// Opt-in only: use a disposable S3 service, never a production bucket.
it.skipIf(!process.env.ISMS_S3_TEST_ENDPOINT)(
  "round-trips original and distributed files on real S3",
  async () => {
    const credentials = {
      accessKeyId: "isms-test",
      secretAccessKey: "isms-storage-test-only",
    };
    const target: StorageTarget = {
      id: randomUUID(),
      name: "Disposable integration target",
      type: "s3",
      revision: "test",
      enabled: true,
      testStatus: "success",
      testedAt: null,
      endpoint: process.env.ISMS_S3_TEST_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      bucket: `isms-test-${randomUUID()}`,
      prefix: "documents-test",
    };
    const client = new S3Client({
      endpoint: target.endpoint,
      region: target.region,
      forcePathStyle: true,
      credentials,
    });
    const storage = new StorageService({
      get: async () => target,
      credentials: () => credentials,
      markTest: async () => undefined,
    } as never);
    await client.send(new CreateBucketCommand({ Bucket: target.bucket }));
    const key = await storage.uploadKey("documents/original.pdf", target.id);
    const distributed = storage.derivedKey(key, "documents/distributed.pdf");
    try {
      const bytes = Buffer.from("%PDF-1.7 ISMS test file");
      await storage.putObject(key, bytes, {
        "Content-Type": "application/pdf",
      });
      expect((await storage.getBuffer(key)).equals(bytes)).toBe(true);
      expect((await storage.statObject(key)).size).toBe(bytes.length);
      await storage.putObject(distributed, bytes, {});
      target.enabled = false;
      expect((await storage.getBuffer(distributed)).equals(bytes)).toBe(true);
      await storage.removeObject(key);
      await storage.removeObject(distributed);
      await expect(storage.getBuffer(key)).rejects.toThrow();
      expect((await storage.testTarget(target.id)).success).toBe(true);
      expect(
        (await client.send(new ListObjectsV2Command({ Bucket: target.bucket })))
          .KeyCount,
      ).toBe(0);
    } finally {
      await storage.removeObject(key);
      await storage.removeObject(distributed);
      await client.send(new DeleteBucketCommand({ Bucket: target.bucket }));
      client.destroy();
    }
  },
  30000,
);
