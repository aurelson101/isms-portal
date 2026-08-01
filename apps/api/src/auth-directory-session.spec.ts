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
      { adminAccount: { findFirst } } as never,
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
  });
});
