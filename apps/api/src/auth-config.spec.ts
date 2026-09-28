import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller";

const originalPilotUrl = process.env.SSO_PILOT_URL;
const originalLoginUrl = process.env.SSO_LOGIN_URL;

afterEach(() => {
  if (originalPilotUrl === undefined) delete process.env.SSO_PILOT_URL;
  else process.env.SSO_PILOT_URL = originalPilotUrl;
  if (originalLoginUrl === undefined) delete process.env.SSO_LOGIN_URL;
  else process.env.SSO_LOGIN_URL = originalLoginUrl;
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
