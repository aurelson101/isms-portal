import type { PrismaService } from "./prisma.service";
import type { CryptoService } from "./crypto.service";
import { environmentTimestampConfig, type TimestampConfig } from "./timestamp";

type SettingsStore = Pick<PrismaService, "applicationSetting">;

const TIMESTAMP_SETTING = "ged.timestamp";
export const SHARING_SETTING = "ged.externalSharing";

type StoredTimestamp = {
  enabled: boolean;
  url: string;
  username?: string;
  policyOid?: string;
  password?: string; // encrypted with CryptoService
};

const read = async <T>(prisma: SettingsStore, key: string) =>
  (await prisma.applicationSetting.findUnique({ where: { key } }))?.value as
    | T
    | undefined;

/** Public view of the time-stamping option (never returns the password). */
export async function timestampSettings(prisma: SettingsStore) {
  const stored = await read<StoredTimestamp>(prisma, TIMESTAMP_SETTING);
  if (stored)
    return {
      source: "settings" as const,
      enabled: stored.enabled,
      url: stored.url,
      username: stored.username || "",
      policyOid: stored.policyOid || "",
      hasPassword: Boolean(stored.password),
    };
  const environment = environmentTimestampConfig();
  return {
    source: environment ? ("environment" as const) : ("none" as const),
    enabled: Boolean(environment),
    url: environment?.url || "",
    username: environment?.username || "",
    policyOid: environment?.policyOid || "",
    hasPassword: Boolean(environment?.password),
  };
}

/** Effective configuration: the administrator option wins over TSA_* variables. */
export async function loadTimestampConfig(
  prisma: SettingsStore,
  crypto: CryptoService,
): Promise<TimestampConfig | null> {
  const stored = await read<StoredTimestamp>(prisma, TIMESTAMP_SETTING);
  if (!stored) return environmentTimestampConfig();
  if (!stored.enabled || !stored.url) return null;
  return {
    url: stored.url,
    username: stored.username || undefined,
    password: stored.password ? crypto.decrypt(stored.password) : undefined,
    policyOid: stored.policyOid || undefined,
  };
}

export async function saveTimestampSettings(
  prisma: SettingsStore,
  crypto: CryptoService,
  input: {
    enabled: boolean;
    url: string;
    username?: string;
    policyOid?: string;
    password?: string;
    clearPassword?: boolean;
  },
) {
  const previous = await read<StoredTimestamp>(prisma, TIMESTAMP_SETTING);
  const value: StoredTimestamp = {
    enabled: input.enabled,
    url: input.url.trim(),
    ...(input.username?.trim() ? { username: input.username.trim() } : {}),
    ...(input.policyOid?.trim() ? { policyOid: input.policyOid.trim() } : {}),
  };
  if (input.password) value.password = crypto.encrypt(input.password);
  else if (!input.clearPassword && previous?.password)
    value.password = previous.password;
  await prisma.applicationSetting.upsert({
    where: { key: TIMESTAMP_SETTING },
    create: { key: TIMESTAMP_SETTING, value },
    update: { value },
  });
  return timestampSettings(prisma);
}

export type SharingSettings = { enabled: boolean; maxDays: number };

export async function sharingSettings(
  prisma: SettingsStore,
): Promise<SharingSettings> {
  const stored = await read<Partial<SharingSettings>>(prisma, SHARING_SETTING);
  return {
    enabled: stored?.enabled === true,
    maxDays: Math.min(90, Math.max(1, Number(stored?.maxDays) || 30)),
  };
}
