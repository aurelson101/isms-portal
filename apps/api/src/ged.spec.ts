import { describe, expect, it, vi } from "vitest";
import { parseTimestampResponse, timestampRequest } from "./timestamp";
import { GENESIS_HASH, auditEventHash, chainAuditEvents } from "./audit-chain";
import {
  applyDocumentType,
  assertDocumentTypeComplete,
} from "./document-types";
import { lockedByOther } from "./ged.controller";
import { promoteLatestToMajor, versionLabel } from "./version-label";
import { loadTimestampConfig, timestampSettings } from "./ged-settings";
import { extractDocumentText } from "./document-diff";
import { strToU8, zipSync } from "fflate";

const hash = "ab".repeat(32);
const nonce = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
const der = (tag: number, value: Buffer) =>
  Buffer.concat([Buffer.from([tag, value.length]), value]);

describe("RFC 3161 time-stamping", () => {
  it("encodes a SHA-256 request with nonce and certificate request", () => {
    const request = timestampRequest(hash, nonce);
    expect(request[0]).toBe(0x30);
    expect(request.includes(Buffer.from(hash, "hex"))).toBe(true);
    expect(request.includes(nonce)).toBe(true);
    // sha256 OID 2.16.840.1.101.3.4.2.1
    expect(request.includes(Buffer.from("0609608648016503040201", "hex"))).toBe(
      true,
    );
    expect(request.subarray(-3)).toEqual(Buffer.from([0x01, 0x01, 0xff]));
  });

  const response = (status: number, imprint = hash) => {
    const token = der(
      0x30,
      Buffer.concat([
        der(0x04, Buffer.from(imprint, "hex")),
        der(0x02, nonce),
        der(0x18, Buffer.from("20261103101500Z", "latin1")),
      ]),
    );
    return der(
      0x30,
      Buffer.concat([der(0x30, der(0x02, Buffer.from([status]))), token]),
    );
  };

  it("accepts a granted token covering the hash and reads genTime", () => {
    const result = parseTimestampResponse(response(0), hash, nonce);
    expect(result.genTime?.toISOString()).toBe("2026-11-03T10:15:00.000Z");
    expect(result.token[0]).toBe(0x30);
  });

  it("rejects refused requests and tokens for another hash", () => {
    expect(() => parseTimestampResponse(response(2), hash, nonce)).toThrow(
      /rejected/u,
    );
    expect(() =>
      parseTimestampResponse(response(0, "cd".repeat(32)), hash, nonce),
    ).toThrow(/does not cover/u);
  });
});

describe("audit hash chain", () => {
  const event = {
    id: "e1",
    occurredAt: new Date("2026-11-03T10:00:00Z"),
    identity: "alice",
    ipAddress: "10.0.0.1",
    action: "document.publish",
    resource: "document:1",
    result: "success",
    correlationId: "c1",
    details: { b: 1, a: [1, 2] },
  };

  it("is deterministic regardless of JSON key order and detects changes", () => {
    const first = auditEventHash(GENESIS_HASH, event);
    expect(
      auditEventHash(GENESIS_HASH, { ...event, details: { a: [1, 2], b: 1 } }),
    ).toBe(first);
    expect(
      auditEventHash(GENESIS_HASH, { ...event, identity: "mallory" }),
    ).not.toBe(first);
    expect(auditEventHash(first, event)).not.toBe(first);
  });

  it("chains settled events after the last chained one", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      auditEvent: {
        findFirst: vi.fn().mockResolvedValue({
          chainIndex: BigInt(4),
          chainHash: "f".repeat(64),
        }),
        findMany: vi.fn().mockResolvedValue([event, { ...event, id: "e2" }]),
        update,
      },
    };
    const result = await chainAuditEvents(
      tx as never,
      Date.parse("2026-11-03T11:00:00Z"),
    );
    expect(result.chained).toBe(2);
    expect(update.mock.calls[0][0].data).toMatchObject({
      chainIndex: BigInt(5),
      prevHash: "f".repeat(64),
    });
    expect(update.mock.calls[1][0].data.prevHash).toBe(
      update.mock.calls[0][0].data.chainHash,
    );
    expect(result.lastIndex).toBe(BigInt(6));
  });
});

describe("document types", () => {
  const type = {
    id: "t1",
    nameFr: "Procédure",
    requiredFields: ["ged.owner", "ged.reference"],
    referencePrefix: "PRO",
  };

  it("assigns the next reference and accepts complete metadata", async () => {
    const tx = {
      documentType: { findFirst: vi.fn().mockResolvedValue(type) },
      $queryRaw: vi.fn().mockResolvedValue([{ number: 12 }]),
    };
    await expect(
      applyDocumentType(tx as never, {
        "ged.documentType": "procedure",
        "ged.owner": "IT",
      }),
    ).resolves.toMatchObject({ "ged.reference": "PRO-012" });
  });

  it("rejects missing required fields and keeps free types optional", async () => {
    const tx = {
      documentType: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...type, referencePrefix: null }),
      },
    };
    await expect(
      applyDocumentType(tx as never, { "ged.documentType": "procedure" }),
    ).rejects.toThrow();
    const free = {
      documentType: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      applyDocumentType(free as never, { "ged.documentType": "custom" }),
    ).resolves.toEqual({ "ged.documentType": "custom" });
  });

  it("blocks publication of an incomplete typed document", async () => {
    const tx = {
      document: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ metadata: { "ged.documentType": "procedure" } }),
      },
      documentType: { findFirst: vi.fn().mockResolvedValue(type) },
    };
    await expect(assertDocumentTypeComplete(tx as never, "d1")).rejects.toThrow(
      /before publishing/u,
    );
  });
});

describe("edit lock", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  it("only blocks another person while the lock is valid", () => {
    const lock = {
      lockedBy: "alice",
      lockExpiresAt: new Date("2026-11-03T12:00:00Z"),
    };
    expect(lockedByOther(lock, "bob", now)).toBe(true);
    expect(lockedByOther(lock, "alice", now)).toBe(false);
    expect(
      lockedByOther(
        { ...lock, lockExpiresAt: new Date("2026-11-03T09:00:00Z") },
        "bob",
        now,
      ),
    ).toBe(false);
    expect(
      lockedByOther({ lockedBy: null, lockExpiresAt: null }, "bob", now),
    ).toBe(false);
  });
});

describe("major and minor versions", () => {
  it("promotes the latest draft of each language to the next major", async () => {
    const update = vi.fn();
    const tx = {
      documentVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "fr1",
            locale: "fr",
            version: 1,
            versionMajor: 1,
            versionMinor: 0,
          },
          {
            id: "fr2",
            locale: "fr",
            version: 2,
            versionMajor: 1,
            versionMinor: 1,
          },
          {
            id: "en1",
            locale: "en",
            version: 1,
            versionMajor: 1,
            versionMinor: 0,
          },
        ]),
        update,
      },
    };
    await promoteLatestToMajor(tx as never, "doc");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "fr2" },
      data: { versionMajor: 2, versionMinor: 0 },
    });
    expect(versionLabel({ versionMajor: 0, versionMinor: 2 })).toBe("0.2");
  });
});

describe("time-stamping option", () => {
  const crypto = { decrypt: (value: string) => `plain:${value}` };
  const store = (value: unknown) => ({
    applicationSetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue(value === undefined ? null : { value }),
    },
  });

  it("uses the administrator setting before TSA_* variables", async () => {
    vi.stubEnv("TSA_URL", "https://env.example/tsa");
    await expect(
      loadTimestampConfig(store(undefined) as never, crypto as never),
    ).resolves.toMatchObject({
      url: "https://env.example/tsa",
    });
    await expect(
      loadTimestampConfig(
        store({ enabled: false, url: "https://tsa.example" }) as never,
        crypto as never,
      ),
    ).resolves.toBeNull();
    await expect(
      loadTimestampConfig(
        store({
          enabled: true,
          url: "https://tsa.example",
          username: "u",
          password: "x",
        }) as never,
        crypto as never,
      ),
    ).resolves.toEqual({
      url: "https://tsa.example",
      username: "u",
      password: "plain:x",
      policyOid: undefined,
    });
    vi.unstubAllEnvs();
  });

  it("never exposes the stored password", async () => {
    const view = await timestampSettings(
      store({
        enabled: true,
        url: "https://tsa.example",
        password: "secret",
      }) as never,
    );
    expect(view).toMatchObject({ source: "settings", hasPassword: true });
    expect(JSON.stringify(view)).not.toContain("secret");
  });
});

describe("additional formats", () => {
  it("extracts text from TXT/CSV and PowerPoint slides", async () => {
    await expect(
      extractDocumentText(Buffer.from("﻿ligne 1\r\nligne 2"), ".txt"),
    ).resolves.toMatchObject({ text: "ligne 1\nligne 2" });
    const pptx = Buffer.from(
      zipSync({
        "ppt/slides/slide2.xml": strToU8(
          "<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>",
        ),
        "ppt/slides/slide1.xml": strToU8(
          "<p:sld><a:p><a:r><a:t>First &amp; title</a:t></a:r></a:p></p:sld>",
        ),
      }),
    );
    await expect(extractDocumentText(pptx, ".pptx")).resolves.toMatchObject({
      text: "First & title\nSecond",
    });
  });
});
