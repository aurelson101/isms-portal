import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Client, escapeFilter } from "ldapts";
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

  private async userBindWithFallback(
    connection: ConnectionWithCa,
    distinguishedName: string,
    password: string,
  ) {
    const hosts = [connection.primaryHost, connection.secondaryHost].filter(
      Boolean,
    ) as string[];
    for (const host of hosts) {
      const client = this.client(connection, host);
      try {
        await client.bind(distinguishedName, password);
        return;
      } catch {
        // Try the secondary controller with the same credentials.
      } finally {
        await client.unbind().catch(() => undefined);
      }
    }
    throw new UnauthorizedException("Invalid directory credentials");
  }

  async authenticateUser(loginValue: string, password: string) {
    const login = loginValue.trim();
    if (!login || login.includes("\\") || login.includes("\0") || !password)
      throw new UnauthorizedException("Invalid directory credentials");
    const connections = await this.prisma.directoryConnection.findMany({
      where: { enabled: true },
      include: { caCertificate: true },
      orderBy: { name: "asc" },
    });
    const preferredConnections = [...connections].sort(
      (left, right) =>
        Number(right.protocol === "LDAPS") - Number(left.protocol === "LDAPS"),
    );
    for (const connection of preferredConnections) {
      let client: Client | null = null;
      try {
        validateFilter(connection.userFilter);
        for (const attribute of [
          connection.loginAttribute,
          connection.usernameAttribute,
          connection.emailAttribute,
          connection.groupAttribute,
        ])
          if (!/^[a-z][a-z0-9-]{0,79}$/iu.test(attribute))
            throw new Error("Invalid directory attribute");
        ({ client } = await this.bindWithFallback(connection));
        const loginFilter = escapeFilter`(|(${connection.loginAttribute}=${login})(${connection.emailAttribute}=${login}))`;
        const result = await client.search(
          connection.userBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: `(&${connection.userFilter}${loginFilter})`,
            sizeLimit: 2,
            attributes: [
              connection.usernameAttribute,
              connection.emailAttribute,
              "displayName",
            ],
          },
        );
        if (result.searchEntries.length !== 1) continue;
        const user = result.searchEntries[0];
        const mail = String(user[connection.emailAttribute] || "")
          .trim()
          .toLowerCase();
        if (!mail.includes("@")) continue;
        await this.userBindWithFallback(connection, user.dn, password);
        const membershipRule = connection.nestedGroups
          ? escapeFilter`(member:1.2.840.113556.1.4.1941:=${user.dn})`
          : escapeFilter`(member=${user.dn})`;
        const groupResult = await client.search(
          connection.groupBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: `(&${connection.groupFilter}${membershipRule})`,
            paged: { pageSize: 500 },
            attributes: [connection.groupAttribute],
          },
        );
        const groups = groupResult.searchEntries
          .map((entry) => String(entry[connection.groupAttribute] || "").trim())
          .filter(Boolean);
        return {
          username: mail,
          displayName: String(user.displayName || mail).trim(),
          groups: [...new Set(groups)],
          connectionId: connection.id,
        };
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
      } finally {
        await client?.unbind().catch(() => undefined);
      }
    }
    throw new UnauthorizedException("Invalid directory credentials");
  }

  async resolveUserByMail(mailValue: string) {
    const mail = mailValue.trim().toLowerCase();
    if (
      !mail.includes("@") ||
      mail.length > 255 ||
      mail.includes("\\") ||
      mail.includes("\0")
    )
      return null;
    const connections = await this.prisma.directoryConnection.findMany({
      where: { enabled: true },
      include: { caCertificate: true },
      orderBy: { name: "asc" },
    });
    const preferredConnections = [...connections].sort(
      (left, right) =>
        Number(right.protocol === "LDAPS") - Number(left.protocol === "LDAPS"),
    );
    for (const connection of preferredConnections) {
      let client: Client | null = null;
      try {
        validateFilter(connection.userFilter);
        validateFilter(connection.groupFilter);
        for (const attribute of [
          connection.emailAttribute,
          connection.groupAttribute,
        ])
          if (!/^[a-z][a-z0-9-]{0,79}$/iu.test(attribute))
            throw new Error("Invalid directory attribute");
        ({ client } = await this.bindWithFallback(connection));
        const mailFilter = escapeFilter`(${connection.emailAttribute}=${mail})`;
        const result = await client.search(
          connection.userBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: `(&${connection.userFilter}${mailFilter})`,
            sizeLimit: 2,
            attributes: [connection.emailAttribute, "displayName"],
          },
        );
        if (result.searchEntries.length !== 1) continue;
        const user = result.searchEntries[0];
        const resolvedMail = String(user[connection.emailAttribute] || "")
          .trim()
          .toLowerCase();
        if (resolvedMail !== mail) continue;
        const membershipRule = connection.nestedGroups
          ? escapeFilter`(member:1.2.840.113556.1.4.1941:=${user.dn})`
          : escapeFilter`(member=${user.dn})`;
        const groupResult = await client.search(
          connection.groupBaseDn || connection.baseDn,
          {
            scope: "sub",
            filter: `(&${connection.groupFilter}${membershipRule})`,
            paged: { pageSize: 500 },
            attributes: [connection.groupAttribute],
          },
        );
        return {
          username: resolvedMail,
          displayName: String(user.displayName || resolvedMail).trim(),
          groups: [
            ...new Set(
              groupResult.searchEntries
                .map((entry) =>
                  String(entry[connection.groupAttribute] || "").trim(),
                )
                .filter(Boolean),
            ),
          ],
          connectionId: connection.id,
        };
      } catch {
        // A secondary connector may still resolve the trusted SSO identity.
      } finally {
        await client?.unbind().catch(() => undefined);
      }
    }
    return null;
  }

  private groupFromEntry(
    connection: ConnectionWithCa,
    entry: Record<string, unknown> & { dn: string },
  ) {
    const rawName = entry[connection.groupAttribute];
    const name = Array.isArray(rawName)
      ? String(rawName[0])
      : String(rawName || "");
    const members = entry.member;
    return {
      name,
      distinguishedName: entry.dn,
      description: entry.description ? String(entry.description) : null,
      memberCount: Array.isArray(members) ? members.length : members ? 1 : 0,
    };
  }

  async searchGroups(query: string) {
    const term = query.trim().slice(0, 120);
    if (term.length < 2) return [];
    const connections = await this.prisma.directoryConnection.findMany({
      where: { enabled: true },
      include: { caCertificate: true },
      orderBy: { name: "asc" },
    });
    if (!connections.length)
      throw new BadRequestException("No active LDAP/LDAPS connector");

    const groups = new Map<
      string,
      {
        connectionId: string;
        connectionName: string;
        name: string;
        distinguishedName: string;
        description: string | null;
        memberCount: number;
      }
    >();
    const errors: string[] = [];
    let successfulConnections = 0;
    for (const connection of connections) {
      try {
        validateFilter(connection.groupFilter);
        if (!/^[a-z][a-z0-9-]{0,79}$/i.test(connection.groupAttribute))
          throw new Error("Invalid group attribute");
        const { client } = await this.bindWithFallback(connection);
        try {
          const nameFilter = escapeFilter`(${connection.groupAttribute}=*${term}*)`;
          const result = await client.search(
            connection.groupBaseDn || connection.baseDn,
            {
              scope: "sub",
              filter: `(&${connection.groupFilter}${nameFilter})`,
              sizeLimit: 20,
              attributes: [connection.groupAttribute, "description", "member"],
            },
          );
          successfulConnections += 1;
          for (const entry of result.searchEntries) {
            const group = this.groupFromEntry(connection, entry);
            if (!group.name) continue;
            groups.set(group.distinguishedName.toLowerCase(), {
              connectionId: connection.id,
              connectionName: connection.name,
              ...group,
            });
          }
        } finally {
          await client.unbind().catch(() => undefined);
        }
      } catch (error) {
        errors.push(
          `${connection.name}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    if (!successfulConnections)
      throw new Error(`Directory group search failed: ${errors.join("; ")}`);
    return [...groups.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 20);
  }

  async searchUsers(query: string) {
    const term = query.trim().slice(0, 120);
    if (term.length < 2) return [];
    const connections = await this.prisma.directoryConnection.findMany({
      where: { enabled: true },
      include: { caCertificate: true },
      orderBy: { name: "asc" },
    });
    if (!connections.length)
      throw new BadRequestException("No active LDAP/LDAPS connector");
    const users = new Map<
      string,
      { username: string; displayName: string; email: string | null }
    >();
    let success = false;
    for (const connection of connections) {
      try {
        validateFilter(connection.userFilter);
        const { client } = await this.bindWithFallback(connection);
        try {
          const search = escapeFilter`(|(${connection.usernameAttribute}=*${term}*)(displayName=*${term}*)(${connection.emailAttribute}=*${term}*))`;
          const result = await client.search(
            connection.userBaseDn || connection.baseDn,
            {
              scope: "sub",
              filter: `(&${connection.userFilter}${search})`,
              sizeLimit: 20,
              attributes: [
                connection.usernameAttribute,
                "displayName",
                connection.emailAttribute,
              ],
            },
          );
          success = true;
          for (const entry of result.searchEntries) {
            const username = String(
              entry[connection.usernameAttribute] || "",
            ).trim();
            if (!username) continue;
            users.set(username.toLowerCase(), {
              username,
              displayName: String(entry.displayName || username),
              email: entry[connection.emailAttribute]
                ? String(entry[connection.emailAttribute])
                : null,
            });
          }
        } finally {
          await client.unbind().catch(() => undefined);
        }
      } catch {
        // A secondary connector may still answer.
      }
    }
    if (!success) throw new Error("Directory user search failed");
    return [...users.values()].slice(0, 20);
  }

  async importGroup(connectionId: string, distinguishedName: string) {
    const connection = await this.connection(connectionId);
    if (!connection?.enabled)
      throw new BadRequestException("LDAP/LDAPS connector is not active");
    validateFilter(connection.groupFilter);
    const groupBase = connection.groupBaseDn || connection.baseDn;
    if (
      !distinguishedName.trim().toLowerCase().endsWith(groupBase.toLowerCase())
    )
      throw new BadRequestException(
        "AD group is outside the configured Group Base DN",
      );
    const { client } = await this.bindWithFallback(connection);
    try {
      const result = await client.search(distinguishedName.trim(), {
        scope: "base",
        filter: connection.groupFilter,
        sizeLimit: 1,
        attributes: [connection.groupAttribute, "description", "member"],
      });
      const entry = result.searchEntries[0];
      if (!entry) throw new BadRequestException("AD group not found");
      const group = this.groupFromEntry(connection, entry);
      if (!group.name) throw new BadRequestException("AD group has no name");
      const existing = await this.prisma.directoryGroup.findFirst({
        where: {
          OR: [
            { distinguishedName: group.distinguishedName },
            { name: group.name },
          ],
        },
        select: { id: true },
      });
      const data = { ...group, active: true, lastSyncedAt: new Date() };
      const synchronizedData = {
        ...data,
        directoryConnectionId: connection.id,
      };
      return existing
        ? this.prisma.directoryGroup.update({
            where: { id: existing.id },
            data: synchronizedData,
          })
        : this.prisma.directoryGroup.create({ data: synchronizedData });
    } finally {
      await client.unbind().catch(() => undefined);
    }
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
      const selectedGroups = await this.prisma.directoryGroup.findMany({
        where: { directoryConnectionId: connection.id },
        select: { id: true, distinguishedName: true },
        orderBy: { name: "asc" },
      });
      const { client, host } = await this.bindWithFallback(connection);
      try {
        let groupCount = 0;
        const synchronizedAt = new Date();
        const synchronizedDns: string[] = [];
        for (const selected of selectedGroups) {
          const result = await client.search(selected.distinguishedName, {
            scope: "base",
            filter: connection.groupFilter,
            sizeLimit: 1,
            attributes: [connection.groupAttribute, "description", "member"],
          });
          const entry = result.searchEntries[0];
          if (!entry) continue;
          const group = this.groupFromEntry(connection, entry);
          if (!group.name) continue;
          await this.prisma.directoryGroup.update({
            where: { id: selected.id },
            data: {
              ...group,
              active: true,
              lastSyncedAt: synchronizedAt,
            },
          });
          synchronizedDns.push(group.distinguishedName);
          groupCount += 1;
        }
        const staleGroups = selectedGroups.length
          ? await this.prisma.directoryGroup.findMany({
              where: {
                directoryConnectionId: connection.id,
                distinguishedName: { notIn: synchronizedDns },
              },
              select: { id: true },
            })
          : [];
        const staleGroupIds = staleGroups.map((group) => group.id);
        const removed = staleGroupIds.length
          ? await this.prisma.$transaction(async (transaction) => {
              const rules = await transaction.accessRule.deleteMany({
                where: { groupId: { in: staleGroupIds } },
              });
              const groups = await transaction.directoryGroup.deleteMany({
                where: { id: { in: staleGroupIds } },
              });
              return { groups: groups.count, rules: rules.count };
            })
          : { groups: 0, rules: 0 };
        const details = {
          host,
          groups: groupCount,
          selectedGroups: selectedGroups.length,
          removedGroups: removed.groups,
          removedRules: removed.rules,
        };
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

  async purgeSynchronizedGroups() {
    return this.prisma.$transaction(async (transaction) => {
      const synchronizedGroups = await transaction.directoryGroup.findMany({
        where: { lastSyncedAt: { not: null } },
        select: { id: true },
      });
      const groupIds = synchronizedGroups.map((group) => group.id);
      if (!groupIds.length) return { groups: 0, rules: 0 };
      const rules = await transaction.accessRule.deleteMany({
        where: { groupId: { in: groupIds } },
      });
      const groups = await transaction.directoryGroup.deleteMany({
        where: { id: { in: groupIds } },
      });
      return { groups: groups.count, rules: rules.count };
    });
  }
}
