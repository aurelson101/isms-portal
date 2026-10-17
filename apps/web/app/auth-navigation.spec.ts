import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminDestination, loginDestination, returnDestination } from "./auth-navigation";
import { loginDestination as sessionLoginDestination } from "./auth-session";

beforeEach(() => vi.stubGlobal("window", { location: new URL("https://isms.example.test/moderator?space=it&status=DRAFT&page=2#moderator-documents") }));
afterEach(() => vi.unstubAllGlobals());

it("preserves moderator filters and section when reconnecting", () => {
  const url = new URL(loginDestination(), window.location.origin);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("return")).toBe("/moderator?space=it&status=DRAFT&page=2#moderator-documents");
});

it("keeps the existing session helper API without duplicating routing logic", () => {
  expect(sessionLoginDestination).toBe(loginDestination);
});

it("preserves administrator query parameters and section", () => {
  vi.stubGlobal("window", { location: new URL("https://isms.example.test/admin?q=travel%20policy#documents") });
  const url = new URL(loginDestination("admin"), window.location.origin);
  expect(url.pathname).toBe("/admin/login");
  expect(url.searchParams.get("return")).toBe("/admin?q=travel%20policy#documents");
});

it("keeps administrator reconnects within the administrator area", () => {
  const url = new URL(loginDestination("admin"), window.location.origin);
  expect(url.pathname).toBe("/admin/login");
  expect(url.searchParams.get("return")).toBe("/admin");
});

it.each([null, "https://untrusted.example/", "//untrusted.example/", "/\\untrusted.example/", "/admin\nignored"])("rejects unsafe return destination %s", requested => {
  expect(returnDestination(requested)).toBe("/");
  expect(adminDestination(requested)).toBe("/admin");
});
