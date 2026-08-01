import { describe, expect, it, vi } from "vitest";
import { IdentityController } from "./controllers";

describe("IdentityController group diagnostics", () => {
  it("returns only active application groups matching the current AD session", async () => {
    const permittedSpaces = vi.fn().mockResolvedValue([]);
    const findMany = vi
      .fn()
      .mockResolvedValue([{ name: "ITAD" }, { name: "VPN-Users" }]);
    const controller = new IdentityController(
      { permittedSpaces } as never,
      {
        userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
        adminAccount: { findUnique: vi.fn().mockResolvedValue(null) },
        directoryGroup: { findMany },
      } as never,
    );

    const response = await controller.get({
      identity: {
        username: "alice@example.com",
        displayName: "Alice Example",
        source: "directory-session",
        groups: ["Domain Users", "itad", "VPN-Users"],
      },
    } as never);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        OR: [
          { name: { equals: "Domain Users", mode: "insensitive" } },
          { name: { equals: "itad", mode: "insensitive" } },
          { name: { equals: "VPN-Users", mode: "insensitive" } },
        ],
      },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    expect(response.authentication.diagnostics).toMatchObject({
      groupCount: 3,
      matchedGroups: ["ITAD", "VPN-Users"],
      mappedSpaceCount: 0,
    });
  });
});
