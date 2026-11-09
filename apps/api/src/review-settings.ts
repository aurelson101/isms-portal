import type { PrismaService } from "./prisma.service";

export const REVIEW_SETTINGS_KEY = "governance.document-reviews";
export const REVIEW_INTERVALS = [30, 60, 90, 180, 365] as const;

export async function reviewSettings(
  prisma: Pick<PrismaService, "applicationSetting">,
) {
  const setting = await prisma.applicationSetting.findUnique({
    where: { key: REVIEW_SETTINGS_KEY },
  });
  const days = (setting?.value as { intervalDays?: number } | null)
    ?.intervalDays;
  return {
    intervalDays: REVIEW_INTERVALS.includes(
      days as (typeof REVIEW_INTERVALS)[number],
    )
      ? days!
      : 30,
  };
}
