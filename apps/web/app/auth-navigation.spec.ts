import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  adminDestination,
  configuredSsoDestination,
  loginDestination,
  returnDestination,
  ssoDestination,
  type AuthConfig,
} from "./auth-navigation";
import { loginDestination as sessionLoginDestination } from "./auth-session";

beforeEach(() =>
  vi.stubGlobal("window", {
    location: new URL(
      "https://isms.example.test/moderator?space=it&status=DRAFT&page=2#moderator-documents",
    ),
  }),
);
afterEach(() => vi.unstubAllGlobals());

const config: AuthConfig = {
  directoryLoginEnabled: true,
  ssoEnabled: true,
  ssoLoginUrl: "/oauth2/start",
  ssoPilotUrl: null,
};

it("shares configured SSO routing while keeping admin return boundaries", () => {
  expect(configuredSsoDestination(config, "/moderator")).toBe(
    "/oauth2/start?rd=%2Fmoderator",
  );
  expect(configuredSsoDestination(config, "/moderator", "admin")).toBe(
    "/oauth2/start?rd=%2Fadmin",
  );
  expect(configuredSsoDestination(config, "/admin#documents", "admin")).toBe(
    "/oauth2/start?rd=%2Fadmin%23documents",
  );
});

it("honors pilot configuration and never enables disabled SSO", () => {
  expect(
    configuredSsoDestination(
      { ...config, ssoPilotUrl: "/oauth2/start?pilot=1" },
      "/",
    ),
  ).toBe("/oauth2/start?pilot=1&rd=%2F");
  expect(
    configuredSsoDestination({ ...config, ssoEnabled: false }, "/"),
  ).toBeNull();
  expect(
    configuredSsoDestination({ ...config, ssoLoginUrl: null }, "/"),
  ).toBeNull();
  expect(
    configuredSsoDestination(
      { ...config, ssoPilotUrl: "https://untrusted.example/oauth2/start" },
      "/",
    ),
  ).toBeNull();
});

it("preserves moderator filters and section when reconnecting", () => {
  const url = new URL(loginDestination(), window.location.origin);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("return")).toBe(
    "/moderator?space=it&status=DRAFT&page=2#moderator-documents",
  );
});

it("keeps the existing session helper API without duplicating routing logic", () => {
  expect(sessionLoginDestination).toBe(loginDestination);
});

it("preserves administrator query parameters and section", () => {
  vi.stubGlobal("window", {
    location: new URL(
      "https://isms.example.test/admin?q=travel%20policy#documents",
    ),
  });
  const url = new URL(loginDestination("admin"), window.location.origin);
  expect(url.pathname).toBe("/admin/login");
  expect(url.searchParams.get("return")).toBe(
    "/admin?q=travel%20policy#documents",
  );
});

it("keeps administrator reconnects within the administrator area", () => {
  const url = new URL(loginDestination("admin"), window.location.origin);
  expect(url.pathname).toBe("/admin/login");
  expect(url.searchParams.get("return")).toBe("/admin");
});

it.each([
  null,
  "https://untrusted.example/",
  "//untrusted.example/",
  "/\\untrusted.example/",
  "/admin\nignored",
])("rejects unsafe return destination %s", (requested) => {
  expect(returnDestination(requested)).toBe("/");
  expect(adminDestination(requested)).toBe("/admin");
});

it.each([
  "/moderator?space=it&page=2#moderator-documents",
  "/admin?q=travel#documents",
])("preserves the SSO return destination %s", (requested) => {
  const result = ssoDestination("/oauth2/start?pilot=1&rd=%2Fold", requested);
  const url = new URL(result!, window.location.origin);
  expect(url.pathname).toBe("/oauth2/start");
  expect(url.searchParams.get("pilot")).toBe("1");
  expect(url.searchParams.getAll("rd")).toEqual([requested]);
});

it.each([
  "https://untrusted.example/oauth2/start",
  "//untrusted.example/oauth2/start",
  "/oauth2-evil/start",
  "/admin",
])("rejects an untrusted SSO endpoint %s", (endpoint) => {
  expect(ssoDestination(endpoint, "/moderator")).toBeNull();
});

it("uses the admin fallback for an unsafe SSO return destination", () => {
  const result = ssoDestination(
    "/oauth2/start",
    "https://untrusted.example/",
    "/admin",
  );
  expect(result).toBe("/oauth2/start?rd=%2Fadmin");
});

it.each([
  "/login",
  "/login?return=/admin",
  "/admin/login#documents",
  "/moderator/login",
  "/oauth2/start",
  "/oauth2/callback?code=example",
  "/oauth2/sign_out",
  "/%6cogin",
  "/admin/%6cogin",
  "/%6fauth2/start",
  "/admin/../login",
  "/LOGIN/",
  "/admin//login",
  "/admin/%2flogin",
  "/documents%2f..%2flogin",
])("prevents an authentication return loop through %s", (requested) => {
  expect(returnDestination(requested)).toBe("/");
  expect(adminDestination(requested)).toBe("/admin");
  expect(ssoDestination("/oauth2/start", requested, "/admin")).toBe(
    "/oauth2/start?rd=%2Fadmin",
  );
});

it.each([
  "/%2funtrusted.example",
  "/%5cuntrusted.example",
  "/admin%0aignored",
  "/admin%7fignored",
  "/%zz",
])("rejects encoded or malformed return paths %s", (requested) => {
  expect(returnDestination(requested)).toBe("/");
});

it.each([
  "/documents/login-guide",
  "/admin#sso",
  "/moderator?space=it#documents",
])("keeps legitimate application destinations %s", (requested) => {
  expect(returnDestination(requested)).toBe(requested);
});
