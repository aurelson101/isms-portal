import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DirectoryService } from "./directory.service";

const connection = {
  id: "directory-1",
  name: "AD",
  primaryHost: "dc01.example.com",
  secondaryHost: null,
  port: 636,
  protocol: "LDAPS",
  baseDn: "DC=example,DC=com",
  userBaseDn: "OU=Users,DC=example,DC=com",
  groupBaseDn: "OU=Groups,DC=example,DC=com",
  userFilter: "(objectClass=user)",
  groupFilter: "(objectClass=group)",
  loginAttribute: "sAMAccountName",
  usernameAttribute: "mail",
  emailAttribute: "mail",
  groupAttribute: "cn",
  nestedGroups: true,
  caCertificate: { pem: "certificate" },
};

describe("DirectoryService user authentication", () => {
  it("authenticates a short login and returns mail plus AD groups", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        searchEntries: [
          {
            dn: "CN=Alice,OU=Users,DC=example,DC=com",
            mail: "Alice@Example.com",
            displayName: "Alice Example",
          },
        ],
      })
      .mockResolvedValueOnce({
        searchEntries: [{ cn: "ITAD" }, { cn: "Domain Users" }],
      });
    const client = { search, unbind: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      directoryConnection: {
        findMany: vi.fn().mockResolvedValue([connection]),
      },
    };
    const service = new DirectoryService(prisma as never, {} as never);
    vi.spyOn(service as never, "bindWithFallback").mockResolvedValue({
      client,
      host: connection.primaryHost,
    });
    const userBind = vi
      .spyOn(service as never, "userBindWithFallback")
      .mockResolvedValue(undefined);

    await expect(
      service.authenticateUser("alice", "correct-password"),
    ).resolves.toEqual({
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["ITAD", "Domain Users"],
      connectionId: "directory-1",
    });
    expect(userBind).toHaveBeenCalledWith(
      connection,
      "CN=Alice,OU=Users,DC=example,DC=com",
      "correct-password",
    );
    expect(search.mock.calls[0][1].filter).toContain("(sAMAccountName=alice)");
  });

  it("rejects UPN and domain-qualified values before querying LDAP", async () => {
    const prisma = {
      directoryConnection: { findMany: vi.fn() },
    };
    const service = new DirectoryService(prisma as never, {} as never);

    await expect(
      service.authenticateUser("alice@example.com", "password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.authenticateUser("EXAMPLE\\alice", "password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.directoryConnection.findMany).not.toHaveBeenCalled();
  });
});
