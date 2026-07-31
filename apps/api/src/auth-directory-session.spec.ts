import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService directory sessions", () => {
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
});
