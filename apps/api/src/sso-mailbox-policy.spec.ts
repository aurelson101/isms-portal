import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SsoMailboxPolicy } from "./sso-mailbox-policy";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  mail: "alice@example.com",
  accountEnabled: true,
  userType: "Member",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
let policy: SsoMailboxPolicy;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SSO_MAILBOX_POLICY_ENABLED", "true");
  vi.stubEnv("SSO_MAILBOX_ALLOWED_DOMAINS", "example.com");
  policy = new SsoMailboxPolicy();
  vi.spyOn(
    policy as unknown as { accessToken(): Promise<string> },
    "accessToken",
  ).mockResolvedValue("test-token");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SSO personal mailbox eligibility", () => {
  it("is opt-in", async () => {
    vi.stubEnv("SSO_MAILBOX_POLICY_ENABLED", "false");
    await policy.assertAllowed("alice@outside.example");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows an active internal personal mailbox and caches the result", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ value: [user] }))
      .mockResolvedValueOnce(json({ value: "user" }));
    await policy.assertAllowed("ALICE@example.com");
    await policy.assertAllowed("alice@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(
      `/users/${user.id}/mailboxSettings/userPurpose`,
    );
  });
  it.each(["shared", "room", "equipment", "linked", "unknownFutureValue"])(
    "denies a %s mailbox",
    async (purpose) => {
      fetchMock
        .mockResolvedValueOnce(json({ value: [user] }))
        .mockResolvedValueOnce(json({ value: purpose }));
      await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it.each([
    { ...user, accountEnabled: false },
    { ...user, userType: "Guest" },
    { ...user, mail: "other@example.com" },
    { ...user, id: "invalid" },
  ])("denies an ineligible directory account", async (account) => {
    fetchMock.mockResolvedValueOnce(json({ value: [account] }));
    await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([[], [user, user]])(
    "denies missing or ambiguous identities",
    async (users) => {
      fetchMock.mockResolvedValueOnce(json({ value: users }));
      await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it.each([
    "alice@outside.example",
    "alice@example.com.attacker.example",
    "alice'@example.com",
  ])("rejects unauthorized or malformed addresses", async (mail) => {
    await expect(policy.assertAllowed(mail)).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed for missing configuration", async () => {
    vi.stubEnv("SSO_MAILBOX_ALLOWED_DOMAINS", "");
    await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("denies an absent mailbox", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ value: [user] }))
      .mockResolvedValueOnce(json({}, 404));
    await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each([401, 403, 429, 503])(
    "fails closed on Graph HTTP %s without caching an outage",
    async (status) => {
      fetchMock.mockResolvedValueOnce(json({}, status));
      await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
        status: 503,
      });
      fetchMock
        .mockResolvedValueOnce(json({ value: [user] }))
        .mockResolvedValueOnce(json({ value: "user" }));
      await policy.assertAllowed(user.mail);
    },
  );
  it("fails closed on network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("never reuses an expired approval during a Graph outage", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json({ value: [user] }))
      .mockResolvedValueOnce(json({ value: "user" }));
    await policy.assertAllowed(user.mail);
    vi.advanceTimersByTime(60001);
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await expect(policy.assertAllowed(user.mail)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("coalesces concurrent requests", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ value: [user] }))
      .mockResolvedValueOnce(json({ value: "user" }));
    await Promise.all([
      policy.assertAllowed(user.mail),
      policy.assertAllowed(user.mail),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
