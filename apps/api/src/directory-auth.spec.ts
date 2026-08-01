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

const harness = (
  users: Array<Record<string, unknown> & { dn: string }>,
  selectedConnection = connection,
) => {
  const search = vi
    .fn()
    .mockResolvedValueOnce({ searchEntries: users })
    .mockResolvedValueOnce({
      searchEntries: [{ cn: "ITAD" }, { cn: "Domain Users" }],
    });
  const client = { search, unbind: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    directoryConnection: {
      findMany: vi.fn().mockResolvedValue([selectedConnection]),
    },
  };
  const service = new DirectoryService(prisma as never, {} as never);
  vi.spyOn(service as never, "bindWithFallback").mockResolvedValue({
    client,
    host: selectedConnection.primaryHost,
  });
  const userBind = vi
    .spyOn(service as never, "userBindWithFallback")
    .mockResolvedValue(undefined);
  return { service, prisma, search, userBind };
};

const alice = {
  dn: "CN=Alice,OU=Users,DC=example,DC=com",
  mail: "Alice@Example.com",
  displayName: "Alice Example",
};

describe("DirectoryService user authentication", () => {
  it.each(["alice", "ALICE@EXAMPLE.COM"])(
    "authenticates %s through the short-login or mail attributes",
    async (identifier) => {
      const { service, search, userBind } = harness([alice]);

      await expect(
        service.authenticateUser(identifier, "correct-password"),
      ).resolves.toEqual({
        username: "alice@example.com",
        displayName: "Alice Example",
        groups: ["ITAD", "Domain Users"],
        connectionId: "directory-1",
      });
      expect(userBind).toHaveBeenCalledWith(
        connection,
        alice.dn,
        "correct-password",
      );
      const filter = String(search.mock.calls[0][1].filter);
      expect(filter).toContain(`(sAMAccountName=${identifier})`);
      expect(filter).toContain(`(mail=${identifier})`);
    },
  );

  it("allows authentication through an explicitly enabled LDAP connector", async () => {
    const ldapConnection = {
      ...connection,
      port: 389,
      protocol: "LDAP",
      caCertificate: null,
    };
    const { service, prisma, userBind } = harness([alice], ldapConnection);

    await expect(
      service.authenticateUser("alice", "correct-password"),
    ).resolves.toMatchObject({ username: "alice@example.com" });
    expect(prisma.directoryConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } }),
    );
    expect(userBind).toHaveBeenCalledWith(
      ldapConnection,
      alice.dn,
      "correct-password",
    );
  });

  it("escapes LDAP filter metacharacters instead of interpreting them", async () => {
    const { service, search } = harness([]);

    await expect(
      service.authenticateUser("a*)(objectClass=*)", "password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const filter = String(search.mock.calls[0][1].filter);
    expect(filter).not.toContain("(objectClass=*)");
    expect(filter).toContain("a\\2a\\29\\28objectClass=\\2a\\29");
  });

  it.each([
    { label: "unknown account", users: [] },
    {
      label: "ambiguous account",
      users: [alice, { ...alice, dn: "CN=Alice2" }],
    },
    {
      label: "account without mail",
      users: [{ dn: alice.dn, sAMAccountName: "alice" }],
    },
  ])(
    "rejects an $label without attempting the user bind",
    async ({ users }) => {
      const { service, userBind } = harness(users);

      await expect(
        service.authenticateUser("alice", "password"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userBind).not.toHaveBeenCalled();
    },
  );

  it("returns the same generic error when the AD password is rejected", async () => {
    const { service, userBind } = harness([alice]);
    userBind.mockRejectedValueOnce(
      new UnauthorizedException("Invalid directory credentials"),
    );

    await expect(
      service.authenticateUser("alice@example.com", "wrong-password"),
    ).rejects.toThrow("Invalid directory credentials");
  });

  it("rejects domain-qualified values before querying LDAP", async () => {
    const prisma = {
      directoryConnection: { findMany: vi.fn() },
    };
    const service = new DirectoryService(prisma as never, {} as never);

    await expect(
      service.authenticateUser("EXAMPLE\\alice", "password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.directoryConnection.findMany).not.toHaveBeenCalled();
  });

  it("resolves a trusted SSO mail to its direct and nested AD groups", async () => {
    const { service, search, userBind } = harness([alice]);

    await expect(
      service.resolveUserByMail(" Alice@Example.com "),
    ).resolves.toEqual({
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["ITAD", "Domain Users"],
      connectionId: "directory-1",
    });
    expect(userBind).not.toHaveBeenCalled();
    expect(String(search.mock.calls[0][1].filter)).toContain(
      "(mail=alice@example.com)",
    );
    expect(String(search.mock.calls[1][1].filter)).toContain(
      "member:1.2.840.113556.1.4.1941:=CN=Alice",
    );
  });

  it("does not resolve an ambiguous SSO mail", async () => {
    const { service, search } = harness([
      alice,
      { ...alice, dn: "CN=Alice2,OU=Users,DC=example,DC=com" },
    ]);

    await expect(service.resolveUserByMail("alice@example.com")).resolves.toBe(
      null,
    );
    expect(search).toHaveBeenCalledOnce();
  });
});
