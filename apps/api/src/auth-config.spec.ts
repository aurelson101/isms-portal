import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller";

const originalPilotUrl = process.env.SSO_PILOT_URL;
const originalLoginUrl = process.env.SSO_LOGIN_URL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPilotUrl === undefined) delete process.env.SSO_PILOT_URL;
  else process.env.SSO_PILOT_URL = originalPilotUrl;
  if (originalLoginUrl === undefined) delete process.env.SSO_LOGIN_URL;
  else process.env.SSO_LOGIN_URL = originalLoginUrl;
});

describe("SSO diagnostics", () => {
  const controller = new AuthController({} as never);
  const tenant = "00000000-0000-4000-8000-000000000001";

  it("rejects an invalid tenant before making a request", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(controller.testSso("entra", "../example")).rejects.toThrow("Invalid Entra tenant ID");
    expect(request).not.toHaveBeenCalled();
  });

  it("checks the expected Entra issuer", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issuer: `https://login.microsoftonline.com/${tenant}/v2.0` }),
    });
    vi.stubGlobal("fetch", request);
    await expect(controller.testSso("entra", tenant)).resolves.toEqual({ target: "entra", ok: true });
    expect(request.mock.calls[0][0]).toBe(`https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`);
  });

  it("reports an unavailable proxy without exposing the network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal host detail")));
    await expect(controller.testSso("proxy")).resolves.toEqual({ target: "proxy", ok: false });
  });
});

describe("SSO login configuration", () => {
  const controller = new AuthController({ directoryLoginEnabled: vi.fn().mockResolvedValue(true) } as never);

  it("exposes a pilot link without enabling automatic login", async () => {
    process.env.SSO_PILOT_URL = "/oauth2/start?rd=/";
    delete process.env.SSO_LOGIN_URL;
    await expect(controller.config()).resolves.toMatchObject({ ssoEnabled: true, ssoPilotUrl: "/oauth2/start?rd=/", ssoLoginUrl: null });
  });

  it("ignores an invalid external pilot URL", async () => {
    process.env.SSO_PILOT_URL = "https://untrusted.example/oauth2/start";
    delete process.env.SSO_LOGIN_URL;
    await expect(controller.config()).resolves.toMatchObject({ ssoEnabled: false, ssoPilotUrl: null, ssoLoginUrl: null });
  });
});
