import { describe, expect, it, vi } from "vitest";
import { validateSync } from "class-validator";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ReviewTicketEmailDto } from "./governance.dto";
import { GovernanceController } from "./governance.controller";
import { AdminGuard } from "./security";
import {
  reviewTicketSettings,
  reviewTicketDefaults,
  REVIEW_TICKET_SETTING,
} from "./review-ticket-settings";

describe("separate review email settings", () => {
  it.each([
    null,
    { enabled: false, recipient: "soc@example.com" },
    { enabled: true, recipient: " SOC@EXAMPLE.COM " },
  ])("loads persisted settings: %j", async (value) => {
    const prisma = {
      applicationSetting: {
        findUnique: vi.fn().mockResolvedValue(value ? { value } : null),
      },
    };
    expect(await reviewTicketSettings(prisma as never)).toEqual(
      value
        ? {
            enabled: value.enabled,
            recipient: value.recipient.trim().toLowerCase(),
          }
        : reviewTicketDefaults,
    );
  });
  it.each([
    {},
    { enabled: true, recipient: "not an email" },
    { enabled: "true", recipient: "soc@example.com" },
    { enabled: true, recipient: "soc@example.com\r\nCc: other@example.com" },
  ])("disables invalid stored configurations: %j", async (value) => {
    const prisma = {
      applicationSetting: { findUnique: vi.fn().mockResolvedValue({ value }) },
    };
    expect((await reviewTicketSettings(prisma as never)).enabled).toBe(false);
  });
  it.each([
    "invalid",
    "soc@example.com\nCc:x@example.com",
    "",
    "a".repeat(255) + "@example.com",
  ])("rejects invalid recipient: %j", (recipient) => {
    expect(
      validateSync(
        Object.assign(new ReviewTicketEmailDto(), { enabled: true, recipient }),
      ),
    ).not.toEqual([]);
  });
  it("saves and audits a setting that is effective on the next read", async () => {
    let value: unknown = null;
    const prisma = {
      applicationSetting: {
        findUnique: vi.fn(async () => (value ? { value } : null)),
        upsert: vi.fn(async ({ create }) => {
          value = create.value;
        }),
      },
    };
    const audit = { record: vi.fn() };
    const controller = new GovernanceController(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = { identity: { username: "admin" } } as never;
    await controller.saveReviewTicketEmail(request, {
      enabled: false,
      recipient: "New-SOC@example.com",
    });
    expect(await controller.reviewTicketEmail()).toEqual({
      enabled: false,
      recipient: "new-soc@example.com",
    });
    expect(audit.record).toHaveBeenCalledWith(
      request,
      "document-review.ticket-email.update",
      `setting:${REVIEW_TICKET_SETTING}`,
      "success",
      { enabled: false, recipient: "new-soc@example.com" },
    );
  });
  it.each(["reviewTicketEmail", "saveReviewTicketEmail"])(
    "denies non-administrators on %s",
    (method) => {
      const guard = new AdminGuard(new Reflector());
      const context = {
        getHandler: () =>
          GovernanceController.prototype[method as "reviewTicketEmail"],
        getClass: () => GovernanceController,
        switchToHttp: () => ({
          getRequest: () => ({ identity: { groups: [] } }),
        }),
      };
      expect(() => guard.canActivate(context as never)).toThrow(
        ForbiddenException,
      );
    },
  );
});
