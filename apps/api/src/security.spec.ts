import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { AdminGuard } from "./security";

const context = (groups: string[]) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ identity: { groups } }) }),
  }) as unknown as ExecutionContext;

describe("AdminGuard", () => {
  const reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
  const guard = new AdminGuard(reflector);

  it("allows public handlers", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    expect(guard.canActivate(context([]))).toBe(true);
  });

  it("allows identities created from a registered administrator account", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    expect(guard.canActivate(context(["ISMS-LOCAL-ADMINS"]))).toBe(true);
  });

  it("does not grant administration from an Active Directory group", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    expect(() => guard.canActivate(context(["ISMS-ADMINS"]))).toThrow(
      ForbiddenException,
    );
  });

  it("denies standard users from admin handlers", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    expect(() => guard.canActivate(context(["Domain Users"]))).toThrow(
      ForbiddenException,
    );
  });
});
