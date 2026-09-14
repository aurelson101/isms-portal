import { describe, expect, it, vi } from "vitest";
import { DirectoryService } from "./directory.service";
function setup(entries: unknown[]) {
  const connection = { id: "dc", userFilter: "(objectClass=user)", emailAttribute: "mail", loginAttribute: "sAMAccountName", usernameAttribute: "userPrincipalName", nestedGroups: true, baseDn: "DC=example,DC=com" };
  const prisma = { directoryConnection: { findMany: vi.fn().mockResolvedValue([connection]) } };
  const client = { search: vi.fn().mockResolvedValue({ searchEntries: entries }), unbind: vi.fn().mockResolvedValue(undefined) };
  const service = new DirectoryService(prisma as never, {} as never);
  vi.spyOn(service as never, "bindWithFallback").mockResolvedValue({ client });
  return { service, client };
}
describe("AD mail recipients", () => {
  it("requires mail, never substitutes UPN, deduplicates", async () => {
    const h = setup([{ mail: " Alice@example.com " }, { mail: "alice@example.com" }, { userPrincipalName: "no-mail@example.com" }, { mail: "invalid" }]);
    expect(await h.service.emailsForIdentities(["alice", "no-mail@example.com"])).toEqual(["alice@example.com"]);
    expect(h.client.search.mock.calls[0][1].filter).toContain("(mail=*)");
    expect(h.client.search.mock.calls[0][1].filter).toContain("(!(userAccountControl:1.2.840.113556.1.4.803:=2))");
  });
  it("resolves nested and primary group members with mail", async () => {
    const h = setup([{ mail: "member@example.com" }]);
    h.client.search.mockResolvedValueOnce({ searchEntries: [{ primaryGroupToken: "513" }] });
    expect(await h.service.emailsForGroup("CN=Domain Users,DC=example,DC=com")).toEqual(["member@example.com"]);
    expect(h.client.search.mock.calls[1][1].filter).toContain("(primaryGroupID=513)");
    expect(h.client.search.mock.calls[1][1].filter).toContain("memberOf:1.2.840.113556.1.4.1941:");
  });
  it("does not silently swallow LDAP errors", async () => {
    const h = setup([]); h.client.search.mockRejectedValue(new Error("bind error"));
    await expect(h.service.emailsForGroup("CN=IT")).rejects.toThrow("LDAP recipient resolution failed");
    expect(h.client.unbind).toHaveBeenCalled();
  });
});
