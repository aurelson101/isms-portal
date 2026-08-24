import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService directory sessions", () => {
  it("enables user login for any active LDAP or LDAPS connector", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "ldap-1" });
    const service = new AuthService(
      { directoryConnection: { findFirst } } as never,
      {} as never,
    );

    await expect(service.directoryLoginEnabled()).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { enabled: true },
      select: { id: true },
    });
  });

  it("stores an opaque session without retaining the AD password", async () => {
    const sessionCreate = vi.fn().mockResolvedValue({ id: "session-1" });
    const directory = {
      authenticateUser: vi.fn().mockResolvedValue({
        username: "alice@example.com",
        displayName: "Alice Example",
        groups: ["ITAD"],
        connectionId: "directory-1",
      }),
    };
    const prisma = {
      directoryUserSession: { create: sessionCreate },
      adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const response = { cookie: vi.fn() };
    const service = new AuthService(prisma as never, directory as never);

    await expect(
      service.directoryLogin("alice", "ad-password", response as never),
    ).resolves.toEqual({ authenticated: true, destination: "/" });
    expect(directory.authenticateUser).toHaveBeenCalledWith(
      "alice",
      "ad-password",
    );
    expect(sessionCreate).toHaveBeenCalledOnce();
    const stored = sessionCreate.mock.calls[0][0].data;
    expect(stored).toMatchObject({
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["ITAD"],
      directoryConnectionId: "directory-1",
    });
    expect(JSON.stringify(stored)).not.toContain("ad-password");
    expect(response.cookie).toHaveBeenCalledWith(
      "isms_directory_session",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      }),
    );
  });

  it("keeps a recognized user device session for 14 days", async () => {
    const sessionCreate = vi.fn().mockResolvedValue({ id: "session-1" });
    const response = { cookie: vi.fn() };
    const service = new AuthService(
      {
        directoryUserSession: { create: sessionCreate },
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {
        authenticateUser: vi.fn().mockResolvedValue({
          username: "alice@example.com",
          displayName: "Alice",
          groups: [],
          connectionId: "directory-1",
        }),
      } as never,
    );
    const before = Date.now();

    await service.directoryLogin("alice", "password", response as never, true);

    const expiresAt = sessionCreate.mock.calls[0][0].data.expiresAt as Date;
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      14 * 24 * 60 * 60 * 1000 - 1000,
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "isms_directory_session",
      expect.any(String),
      expect.objectContaining({ expires: expiresAt, httpOnly: true }),
    );
  });

  it("migrates a legacy short-login administrator grant to canonical mail", async () => {
    const legacyAccount = {
      id: "directory-admin-1",
      username: "alice",
      source: "DIRECTORY",
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(legacyAccount)
      .mockResolvedValueOnce(null);
    const update = vi.fn().mockResolvedValue({
      ...legacyAccount,
      username: "alice@example.com",
    });
    const service = new AuthService(
      {
        directoryUserSession: { create: vi.fn() },
        adminAccount: { findFirst, update },
      } as never,
      {
        authenticateUser: vi.fn().mockResolvedValue({
          username: "alice@example.com",
          displayName: "Alice Example",
          groups: [],
          connectionId: "directory-1",
        }),
      } as never,
    );

    await service.directoryLogin("alice", "ad-password", {
      cookie: vi.fn(),
    } as never);

    expect(update).toHaveBeenCalledWith({
      where: { id: "directory-admin-1" },
      data: { username: "alice@example.com" },
    });
  });

  it("refreshes and persists directory groups without replacing the session", async () => {
    const session = {
      id: "session-1",
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["OLD-GROUP"],
      directoryConnectionId: "directory-1",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const update = vi.fn().mockResolvedValue(session);
    const prisma = {
      directoryUserSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        update,
      },
      adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
      adminDirectoryGroup: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const directory = {
      resolveUserByMail: vi.fn().mockResolvedValue({
        username: "alice@example.com",
        displayName: "Alice Updated",
        groups: ["NEW-GROUP"],
        connectionId: "directory-2",
      }),
    };
    const service = new AuthService(prisma as never, directory as never);

    await expect(
      service.sessionIdentity(
        { headers: { cookie: "isms_directory_session=opaque-token" } } as never,
        true,
      ),
    ).resolves.toMatchObject({
      displayName: "Alice Updated",
      groups: ["NEW-GROUP"],
      source: "directory-session",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        username: "alice@example.com",
        displayName: "Alice Updated",
        groups: ["NEW-GROUP"],
        directoryConnectionId: "directory-2",
      }),
    });
  });

  it("does not write a recent directory session on every request", async () => {
    const session = {
      id: "session-1",
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["KNOWN-GROUP"],
      directoryConnectionId: "directory-1",
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(),
    };
    const update = vi.fn();
    const service = new AuthService(
      {
        directoryUserSession: {
          findUnique: vi.fn().mockResolvedValue(session),
          update,
        },
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        adminDirectoryGroup: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
    );

    await expect(
      service.sessionIdentity({
        headers: { cookie: "isms_directory_session=opaque-token" },
      } as never),
    ).resolves.toMatchObject({ username: "alice@example.com" });
    expect(update).not.toHaveBeenCalled();
  });

  it("removes stale groups when the directory confirms the user is absent", async () => {
    const session = {
      id: "session-1",
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["OLD-GROUP"],
      directoryConnectionId: "directory-1",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const update = vi.fn().mockResolvedValue(session);
    const service = new AuthService(
      {
        directoryUserSession: {
          findUnique: vi.fn().mockResolvedValue(session),
          update,
        },
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        adminDirectoryGroup: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      { resolveUserByMail: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(
      service.sessionIdentity(
        { headers: { cookie: "isms_directory_session=opaque-token" } } as never,
        true,
      ),
    ).resolves.toMatchObject({ groups: [] });
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({ groups: [] }),
    });
  });

  it("keeps the last known groups during a temporary directory outage", async () => {
    const session = {
      id: "session-1",
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["KNOWN-GROUP"],
      directoryConnectionId: "directory-1",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const update = vi.fn().mockResolvedValue(session);
    const service = new AuthService(
      {
        directoryUserSession: {
          findUnique: vi.fn().mockResolvedValue(session),
          update,
        },
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        adminDirectoryGroup: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {
        resolveUserByMail: vi.fn().mockRejectedValue(new Error("DNS outage")),
      } as never,
    );

    await expect(
      service.sessionIdentity(
        { headers: { cookie: "isms_directory_session=opaque-token" } } as never,
        true,
      ),
    ).resolves.toMatchObject({ groups: ["KNOWN-GROUP"] });
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("logs out an administrator without deleting the user session", async () => {
    const adminDelete = vi.fn().mockResolvedValue({ count: 1 });
    const directoryDelete = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      adminSession: { deleteMany: adminDelete },
      directoryUserSession: { deleteMany: directoryDelete },
    };
    const response = { clearCookie: vi.fn() };
    const service = new AuthService(prisma as never, {} as never);

    await service.logout(
      {
        headers: {
          cookie:
            "isms_admin_session=admin-token; isms_directory_session=user-token",
        },
      } as never,
      response as never,
      "admin",
    );

    expect(adminDelete).toHaveBeenCalledOnce();
    expect(directoryDelete).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith("isms_admin_session", {
      path: "/",
    });
    expect(response.clearCookie).not.toHaveBeenCalledWith(
      "isms_directory_session",
      expect.anything(),
    );
  });

  it("enriches and caches trusted Entra identities with LDAP groups", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const resolveUserByMail = vi.fn().mockResolvedValue({
      username: "alice@example.com",
      displayName: "Alice from AD",
      groups: ["ITAD", "Domain Users"],
      connectionId: "directory-1",
    });
    const service = new AuthService(
      {
        adminAccount: { findFirst },
        adminDirectoryGroup: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as never,
      { resolveUserByMail } as never,
    );
    const identity = {
      username: "alice@example.com",
      displayName: "Alice from Entra",
      groups: ["entra-group-id"],
      source: "trusted-proxy" as const,
      sessionExpiresAt: null,
    };

    await expect(service.enrichSsoIdentity(identity)).resolves.toMatchObject({
      username: "alice@example.com",
      displayName: "Alice from AD",
      groups: ["entra-group-id", "ITAD", "Domain Users"],
    });
    await service.enrichSsoIdentity(identity);
    expect(resolveUserByMail).toHaveBeenCalledOnce();

    resolveUserByMail.mockResolvedValue({
      username: "alice@example.com",
      displayName: "Alice refreshed from AD",
      groups: ["UPDATED-GROUP"],
      connectionId: "directory-1",
    });
    await expect(
      service.enrichSsoIdentity(identity, true),
    ).resolves.toMatchObject({
      displayName: "Alice refreshed from AD",
      groups: ["entra-group-id", "UPDATED-GROUP"],
    });
    expect(resolveUserByMail).toHaveBeenCalledTimes(2);
  });

  it("grants administration only when a configured AD admin group matches", async () => {
    const adminDirectoryGroup = {
      findFirst: vi.fn().mockResolvedValue({ id: "admin-group-1" }),
      update: vi.fn().mockResolvedValue({ id: "admin-group-1" }),
    };
    const service = new AuthService(
      {
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        adminDirectoryGroup,
      } as never,
      {} as never,
    );

    await expect(
      service.enrichSsoIdentity({
        username: "alice@example.com",
        displayName: "Alice",
        groups: ["ISMS-Administrators"],
        source: "directory-session",
      }),
    ).resolves.toMatchObject({
      groups: ["ISMS-Administrators", "ISMS-LOCAL-ADMINS"],
    });
    expect(adminDirectoryGroup.findFirst).toHaveBeenCalledWith({
      where: {
        active: true,
        AND: [
          {
            OR: [
              { validUntil: null },
              { validUntil: { gt: expect.any(Date) } },
            ],
          },
        ],
        OR: [
          {
            name: {
              equals: "ISMS-Administrators",
              mode: "insensitive",
            },
          },
        ],
      },
    });
  });

  it("grants administration when the authenticated AD user is explicitly configured", async () => {
    const adminAccount = {
      findFirst: vi.fn().mockResolvedValue({
        id: "directory-admin-1",
        displayName: "Alice Administrator",
        profilePhoto: null,
        lastAuthorizedAt: null,
      }),
      update: vi.fn().mockResolvedValue({ id: "directory-admin-1" }),
    };
    const service = new AuthService(
      {
        adminAccount,
        adminDirectoryGroup: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
    );

    await expect(
      service.enrichSsoIdentity({
        username: "Alice@example.com",
        displayName: "Alice",
        groups: ["Domain Users"],
        source: "directory-session",
      }),
    ).resolves.toMatchObject({
      displayName: "Alice Administrator",
      groups: ["Domain Users", "ISMS-LOCAL-ADMINS"],
    });
    expect(adminAccount.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        username: { equals: "Alice@example.com", mode: "insensitive" },
        source: "DIRECTORY",
        active: true,
      }),
    });
  });

  it("coalesces concurrent LDAP enrichment for the same SSO identity", async () => {
    const resolveUserByMail = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                username: "alice@example.com",
                displayName: "Alice Example",
                groups: ["ITAD"],
                connectionId: "directory-1",
              }),
            5,
          ),
        ),
    );
    const service = new AuthService(
      {
        adminAccount: { findFirst: vi.fn().mockResolvedValue(null) },
        adminDirectoryGroup: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as never,
      { resolveUserByMail } as never,
    );
    const identity = {
      username: "alice@example.com",
      displayName: "Alice",
      groups: [],
      source: "trusted-proxy" as const,
    };

    const [first, second] = await Promise.all([
      service.enrichSsoIdentity(identity),
      service.enrichSsoIdentity(identity),
    ]);

    expect(first.groups).toEqual(["ITAD"]);
    expect(second.groups).toEqual(["ITAD"]);
    expect(resolveUserByMail).toHaveBeenCalledOnce();
  });
});
