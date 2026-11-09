import { describe, expect, it, vi } from "vitest";
import { validateSync } from "class-validator";
import { reviewSettings } from "./review-settings";
import { ReviewSettingsDto } from "./governance.dto";

describe("document review settings", () => {
  it.each([
    null,
    {},
    { intervalDays: "60" },
    { intervalDays: 0 },
    { intervalDays: 1000 },
  ])(
    "uses 30 days for missing or invalid stored settings: %j",
    async (value) => {
      const prisma = {
        applicationSetting: {
          findUnique: vi.fn().mockResolvedValue(value ? { value } : null),
        },
      };
      expect(await reviewSettings(prisma as never)).toEqual({
        intervalDays: 30,
      });
    },
  );
  it.each([30, 60, 90, 180, 365])("accepts %i days", async (intervalDays) => {
    const prisma = {
      applicationSetting: {
        findUnique: vi.fn().mockResolvedValue({ value: { intervalDays } }),
      },
    };
    expect(await reviewSettings(prisma as never)).toEqual({ intervalDays });
    expect(
      validateSync(Object.assign(new ReviewSettingsDto(), { intervalDays })),
    ).toEqual([]);
  });
  it.each([0, -30, 31, 30.5, "60", null, undefined, 1000])(
    "rejects invalid API input: %j",
    (intervalDays) => {
      expect(
        validateSync(Object.assign(new ReviewSettingsDto(), { intervalDays })),
      ).not.toEqual([]);
    },
  );
});
