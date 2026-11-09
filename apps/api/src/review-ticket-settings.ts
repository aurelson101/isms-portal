import { isEmail } from "class-validator";
import type { PrismaService } from "./prisma.service";

export const REVIEW_TICKET_SETTING = "governance.review-ticket-email";
export const reviewTicketDefaults = {
  enabled: true,
  recipient: "helpdesk-soc@deftagroup.com",
};

export async function reviewTicketSettings(
  prisma: Pick<PrismaService, "applicationSetting">,
) {
  const setting = await prisma.applicationSetting.findUnique({
    where: { key: REVIEW_TICKET_SETTING },
  });
  if (!setting) return { ...reviewTicketDefaults };
  const value = setting.value as {
    enabled?: unknown;
    recipient?: unknown;
  } | null;
  const recipient =
    typeof value?.recipient === "string"
      ? value.recipient.trim().toLowerCase()
      : "";
  if (
    typeof value?.enabled !== "boolean" ||
    recipient.length > 254 ||
    !isEmail(recipient)
  )
    return { ...reviewTicketDefaults, enabled: false };
  return { enabled: value.enabled, recipient };
}
