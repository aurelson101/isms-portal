import { createHash } from "node:crypto";
import type { AuditEvent, Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma.service";
import { requestTimestamp, type TimestampConfig } from "./timestamp";

export const GENESIS_HASH = "0".repeat(64);
// Events younger than this may belong to a transaction that has not committed.
const SETTLE_MS = 5 * 60_000;
const BATCH = 2000;

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value ?? null);
};

type ChainedFields = Pick<
  AuditEvent,
  | "id"
  | "occurredAt"
  | "identity"
  | "ipAddress"
  | "action"
  | "resource"
  | "result"
  | "correlationId"
  | "details"
>;

export const auditEventHash = (previous: string, event: ChainedFields) =>
  createHash("sha256")
    .update(previous)
    .update(
      stable([
        event.id,
        event.occurredAt.toISOString(),
        event.identity,
        event.ipAddress,
        event.action,
        event.resource,
        event.result,
        event.correlationId,
        event.details ?? null,
      ]),
    )
    .digest("hex");

/** Appends settled, unchained audit events to the hash chain (worker only). */
export async function chainAuditEvents(
  tx: Prisma.TransactionClient,
  now = Date.now(),
) {
  const last = await tx.auditEvent.findFirst({
    where: { chainIndex: { not: null } },
    orderBy: { chainIndex: "desc" },
    select: { chainIndex: true, chainHash: true },
  });
  let index = last?.chainIndex ?? BigInt(0);
  let previous = last?.chainHash ?? GENESIS_HASH;
  const events = await tx.auditEvent.findMany({
    where: { chainIndex: null, occurredAt: { lt: new Date(now - SETTLE_MS) } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: BATCH,
  });
  for (const event of events) {
    index += BigInt(1);
    const chainHash = auditEventHash(previous, event);
    await tx.auditEvent.update({
      where: { id: event.id },
      data: { chainIndex: index, prevHash: previous, chainHash },
    });
    previous = chainHash;
  }
  return { chained: events.length, lastIndex: index, lastHash: previous };
}

/** Creates a seal row when the interval elapsed and new events were chained. */
export async function sealAuditChain(
  tx: Prisma.TransactionClient,
  now = Date.now(),
) {
  const intervalMinutes = Math.max(
    5,
    Number(process.env.AUDIT_SEAL_INTERVAL_MINUTES || 60),
  );
  const [lastSeal, lastEvent] = await Promise.all([
    tx.auditSeal.findFirst({ orderBy: { createdAt: "desc" } }),
    tx.auditEvent.findFirst({
      where: { chainIndex: { not: null } },
      orderBy: { chainIndex: "desc" },
      select: { chainIndex: true, chainHash: true },
    }),
  ]);
  if (!lastEvent?.chainIndex || !lastEvent.chainHash) return null;
  if (lastSeal && lastSeal.lastChainIndex >= lastEvent.chainIndex) return null;
  if (lastSeal && now - lastSeal.createdAt.getTime() < intervalMinutes * 60_000)
    return null;
  return tx.auditSeal.create({
    data: {
      lastChainIndex: lastEvent.chainIndex,
      chainHash: lastEvent.chainHash,
      eventCount: Number(
        lastEvent.chainIndex - (lastSeal?.lastChainIndex ?? BigInt(0)),
      ),
    },
  });
}

/** Time-stamps recent seals that have no token yet (outside transactions). */
export async function timestampAuditSeals(
  prisma: PrismaService,
  config: TimestampConfig | null,
) {
  if (!config) return 0;
  const seals = await prisma.auditSeal.findMany({
    where: {
      token: null,
      createdAt: { gt: new Date(Date.now() - 7 * 86400000) },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  let stamped = 0;
  for (const seal of seals) {
    const result = await requestTimestamp(seal.chainHash, config);
    if (!result) break;
    await prisma.auditSeal.update({
      where: { id: seal.id },
      data: {
        token: result.token,
        genTime: result.genTime,
        tsaUrl: result.url,
      },
    });
    stamped++;
  }
  return stamped;
}

/** Recomputes the whole remaining chain and checks every seal against it. */
export async function verifyAuditChain(
  prisma: PrismaService,
  timestampAuthorityConfigured = false,
) {
  const broken: Array<{ chainIndex: string; reason: string }> = [];
  let previous: { index: bigint; hash: string } | null = null;
  let checked = 0;
  let firstIndex: bigint | null = null;
  let cursor = BigInt(0);
  for (;;) {
    const events = await prisma.auditEvent.findMany({
      where: { chainIndex: { gt: cursor } },
      orderBy: { chainIndex: "asc" },
      take: 5000,
    });
    if (!events.length) break;
    for (const event of events) {
      const index = event.chainIndex!;
      firstIndex ??= index;
      // Retention may delete the oldest events: the chain then starts at prevHash.
      const expectedPrevious =
        previous && previous.index + BigInt(1) === index
          ? previous.hash
          : event.prevHash;
      if (previous && previous.index + BigInt(1) !== index)
        broken.push({ chainIndex: index.toString(), reason: "missing events" });
      else if (event.prevHash !== expectedPrevious)
        broken.push({ chainIndex: index.toString(), reason: "link mismatch" });
      if (
        auditEventHash(event.prevHash || GENESIS_HASH, event) !==
        event.chainHash
      )
        broken.push({
          chainIndex: index.toString(),
          reason: "content altered",
        });
      previous = { index, hash: event.chainHash || "" };
      checked++;
      cursor = index;
    }
  }
  const seals = await prisma.auditSeal.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  let sealMismatches = 0;
  for (const seal of seals) {
    const event = await prisma.auditEvent.findUnique({
      where: { chainIndex: seal.lastChainIndex },
      select: { chainHash: true },
    });
    if (event && event.chainHash !== seal.chainHash) sealMismatches++;
  }
  const pending = await prisma.auditEvent.count({
    where: { chainIndex: null },
  });
  return {
    valid: broken.length === 0 && sealMismatches === 0,
    checked,
    pending,
    firstIndex: firstIndex?.toString() ?? null,
    lastIndex: previous?.index.toString() ?? null,
    broken: broken.slice(0, 20),
    seals: {
      total: seals.length,
      timestamped: seals.filter((seal) => seal.token).length,
      mismatched: sealMismatches,
      lastSealAt: seals[0]?.createdAt ?? null,
      lastTimestampAt: seals.find((seal) => seal.genTime)?.genTime ?? null,
    },
    timestampAuthorityConfigured,
  };
}
