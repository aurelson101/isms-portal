import { BadRequestException, Injectable } from "@nestjs/common";
import { Client } from "ldapts";
import { lookup } from "dns/promises";
import { connect as tlsConnect } from "tls";
import { createConnection } from "net";
import type { DirectoryConnection, TrustedCaCertificate } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";

type ConnectionWithCa = DirectoryConnection & {
  caCertificate: TrustedCaCertificate | null;
};

const withTimeout = <T>(factory: () => Promise<T>, timeoutMs: number) =>
  Promise.race([
    factory(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs),
    ),
  ]);

const validateFilter = (filter: string) => {
  if (
    !filter.startsWith("(") ||
    !filter.endsWith(")") ||
    filter.includes("\0")
  ) {
    throw new BadRequestException("Invalid LDAP filter");
  }
};

@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async connection(id: string) {
    return this.prisma.directoryConnection.findUnique({
      where: { id },
      include: { caCertificate: true },
    });
  }

  private client(connection: ConnectionWithCa, host: string) {
    const secure = connection.protocol === "LDAPS";
    if (secure && !connection.caCertificate)
      throw new Error("A trusted CA certificate is required for LDAPS");
    return new Client({
      url: `${secure ? "ldaps" : "ldap"}://${host}:${connection.port}`,
      timeout: connection.timeoutMs,
      connectTimeout: connection.timeoutMs,
      strictDN: true,
      tlsOptions: secure
        ? {
            ca: [connection.caCertificate!.pem],
            rejectUnauthorized: true,
            servername: host,
            minVersion: "TLSv1.2",
          }
        : undefined,
    });
  }

  private async bindWithFallback(connection: ConnectionWithCa) {
    const hosts = [connection.primaryHost, connection.secondaryHost].filter(
      Boolean,
    ) as string[];
    const errors: string[] = [];
    for (const host of hosts) {
      for (let attempt = 0; attempt <= connection.retries; attempt += 1) {
        const client = this.client(connection, host);
        try {
          await client.bind(
            connection.bindDn,
            this.crypto.decrypt(connection.encryptedBindSecret),
          );
          return { client, host };
        } catch (error) {
          errors.push(
            `${host} attempt ${attempt + 1}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          await client.unbind().catch(() => undefined);
        }
      }
    }
    throw new Error(errors.join("; "));
  }

  async test(id: string) {
    const connection = await this.connection(id);
    if (!connection)
      throw new BadRequestException("Directory connection not found");
    validateFilter(connection.userFilter);
    validateFilter(connection.groupFilter);
    const results: Record<string, unknown> = {};
    const startedAt = Date.now();
    try {
      results.dns = await withTimeout(async () => {
        const answer = await lookup(connection.primaryHost);
        return { ok: true, address: answer.address };
      }, connection.timeoutMs);
      results.tcp = await new Promise((resolve, reject) => {
        const socket = createConnection({
          host: connection.primaryHost,
          port: connection.port,
        });
        socket.setTimeout(connection.timeoutMs);
        socket.once("connect", () => {
          socket.destroy();
          resolve({ ok: true });
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("TCP timeout"));
        });
        socket.once("error", reject);
      });
      if (connection.protocol === "LDAPS") {
        if (!connection.caCertificate)
          throw new Error("A trusted CA certificate is required for LDAPS");
        results.tls = await new Promise((resolve, reject) => {
          const socket = tlsConnect(
            {
              host: connection.primaryHost,
              port: connection.port,
              servername: connection.primaryHost,
              ca: [connection.caCertificate!.pem],
              rejectUnauthorized: true,
              minVersion: "TLSv1.2",
            },
            () => {
              const peer = socket.getPeerCertificate();
              socket.destroy();
              resolve({
                ok: true,
                subject: peer.subject?.CN,
                validTo: peer.valid_to,
              });
            },
          );
          socket.setTimeout(connection.timeoutMs);
          socket.once("timeout", () => {
            socket.destroy();
            reject(new Error("TLS timeout"));
          });
          socket.once("error", reject);
        });
      }
      const { client, host } = await this.bindWithFallback(connection);
      results.bind = { ok: true, host };
      try {
        const userResult = await client.search(
          connection.userBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: connection.userFilter,
            sizeLimit: 1,
            attributes: [
              connection.usernameAttribute,
              connection.emailAttribute,
            ],
          },
        );
        const groupResult = await client.search(
          connection.groupBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: connection.groupFilter,
            sizeLimit: 1,
            attributes: [connection.groupAttribute, "member"],
          },
        );
        results.userSearch = {
          ok: true,
          count: userResult.searchEntries.length,
        };
        results.groupSearch = {
          ok: true,
          count: groupResult.searchEntries.length,
        };
      } finally {
        await client.unbind().catch(() => undefined);
      }
      await this.prisma.directoryConnection.update({
        where: { id },
        data: { lastTestAt: new Date(), lastTestStatus: "SUCCESS" },
      });
      return { status: "SUCCESS", durationMs: Date.now() - startedAt, results };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown directory error";
      await this.prisma.directoryConnection.update({
        where: { id },
        data: { lastTestAt: new Date(), lastTestStatus: "ERROR" },
      });
      return {
        status: "ERROR",
        durationMs: Date.now() - startedAt,
        results,
        error: message,
      };
    }
  }

  async synchronize(id: string) {
    const connection = await this.connection(id);
    if (!connection)
      throw new BadRequestException("Directory connection not found");
    validateFilter(connection.groupFilter);
    const job = await this.prisma.directorySyncJob.create({
      data: { connectionId: id, status: "RUNNING" },
    });
    try {
      const { client, host } = await this.bindWithFallback(connection);
      try {
        const result = await client.search(
          connection.groupBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: connection.groupFilter,
            attributes: [connection.groupAttribute, "description", "member"],
          },
        );
        for (const entry of result.searchEntries) {
          const rawName = entry[connection.groupAttribute];
          const name = Array.isArray(rawName)
            ? String(rawName[0])
            : String(rawName || "");
          if (!name) continue;
          const members = entry.member;
          const data = {
            name,
            distinguishedName: entry.dn,
            description: entry.description ? String(entry.description) : null,
            memberCount: Array.isArray(members)
              ? members.length
              : members
                ? 1
                : 0,
            active: true,
            lastSyncedAt: new Date(),
          };
          const existing = await this.prisma.directoryGroup.findFirst({
            where: { OR: [{ distinguishedName: entry.dn }, { name }] },
            select: { id: true },
          });
          if (existing) {
            await this.prisma.directoryGroup.update({
              where: { id: existing.id },
              data,
            });
          } else {
            await this.prisma.directoryGroup.create({
              data: {
                name,
                distinguishedName: entry.dn,
                description: entry.description
                  ? String(entry.description)
                  : null,
                memberCount: Array.isArray(members)
                  ? members.length
                  : members
                    ? 1
                    : 0,
                active: true,
                lastSyncedAt: new Date(),
              },
            });
          }
        }
        const details = { host, groups: result.searchEntries.length };
        await this.prisma.directorySyncJob.update({
          where: { id: job.id },
          data: { status: "SUCCESS", details, finishedAt: new Date() },
        });
        return { id: job.id, status: "SUCCESS", ...details };
      } finally {
        await client.unbind().catch(() => undefined);
      }
    } catch (error) {
      const details = {
        error:
          error instanceof Error ? error.message : "Unknown directory error",
      };
      await this.prisma.directorySyncJob.update({
        where: { id: job.id },
        data: { status: "ERROR", details, finishedAt: new Date() },
      });
      return { id: job.id, status: "ERROR", ...details };
    }
  }
}
