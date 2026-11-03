import type { Prisma } from "@prisma/client";

export const versionLabel = (version: {
  versionMajor: number;
  versionMinor: number;
}) => `${version.versionMajor}.${version.versionMinor}`;

/**
 * Publication turns the latest draft of each language into the next major
 * version: 0.2 becomes 1.0, 1.3 becomes 2.0. Already-major versions are kept.
 */
export async function promoteLatestToMajor(
  tx: Prisma.TransactionClient,
  documentId: string,
) {
  const versions = await tx.documentVersion.findMany({
    where: { documentId },
    select: {
      id: true,
      locale: true,
      version: true,
      versionMajor: true,
      versionMinor: true,
    },
  });
  const byLocale = new Map<string, typeof versions>();
  for (const version of versions)
    byLocale.set(version.locale, [
      ...(byLocale.get(version.locale) || []),
      version,
    ]);
  for (const localeVersions of byLocale.values()) {
    const latest = localeVersions.reduce((left, right) =>
      right.version > left.version ? right : left,
    );
    if (latest.versionMinor === 0) continue;
    const major = Math.max(...localeVersions.map((item) => item.versionMajor));
    await tx.documentVersion.update({
      where: { id: latest.id },
      data: { versionMajor: major + 1, versionMinor: 0 },
    });
  }
}
