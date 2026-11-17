import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { validateSync } from "class-validator";
import { DocumentMetadataDto } from "./admin.dto";
import type { PrismaService } from "./prisma.service";

export async function rejectDuplicate(
  prisma: PrismaService,
  sha256: string,
  scope: Prisma.DocumentWhereInput,
) {
  const document = await prisma.document.findFirst({
    where: {
      deletedAt: null,
      AND: [scope],
      versions: { some: { storedFile: { sha256 } } },
    },
    select: {
      id: true,
      slug: true,
      translations: { select: { title: true }, take: 1 },
    },
  });
  if (document)
    throw new ConflictException({
      code: "DOCUMENT_DUPLICATE",
      message:
        "This file already exists. Open the existing document or upload a new version.",
      documentId: document.id,
      slug: document.slug,
      title: document.translations[0]?.title || document.id,
    });
}

const documentFilterKeys = [
  "reference",
  "owner",
  "documentType",
  "keywords",
  "reviewFrom",
  "reviewTo",
] as const;
export type DocumentFilters = Partial<
  Record<(typeof documentFilterKeys)[number], string>
>;

export function metadataWhere(
  filters: DocumentFilters,
): Prisma.DocumentWhereInput[] {
  const result: Prisma.DocumentWhereInput[] = [];
  for (const key of documentFilterKeys) {
    const value = filters[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > 200)
      throw new BadRequestException("Invalid document filter");
    if (key === "reviewFrom" || key === "reviewTo") {
      if (
        !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw new BadRequestException("Invalid review date");
      result.push({
        metadata: {
          path: ["ged.reviewDate"],
          ...(key === "reviewFrom" ? { gte: value } : { lte: value, not: "" }),
        },
      });
    } else {
      if (
        key === "documentType" &&
        !["policy", "procedure", "guide", "evidence", "record"].includes(value)
      )
        throw new BadRequestException("Invalid document type");
      result.push({
        metadata: {
          path: [`ged.${key}`],
          ...(key === "documentType"
            ? { equals: value }
            : { string_contains: value }),
        },
      });
    }
  }
  if (
    filters.reviewFrom &&
    filters.reviewTo &&
    filters.reviewFrom > filters.reviewTo
  )
    throw new BadRequestException("Invalid review date range");
  return result;
}

/** Fold only search terms; the original metadata remains unchanged. */
export function normalizeMetadataSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/œ/gu, "oe")
    .replace(/æ/gu, "ae");
}

export async function resolvedMetadataWhere(
  prisma: PrismaService,
  filters: DocumentFilters,
): Promise<Prisma.DocumentWhereInput[]> {
  // Validate every criterion before querying. Dates and document types retain exact semantics.
  metadataWhere(filters);
  const textKeys = ["reference", "owner", "keywords"] as const;
  const clauses = textKeys
    .filter((key) => !!filters[key])
    .map((key) => {
      const field = Prisma.sql`COALESCE(metadata ->> ${`ged.${key}`}, '')`;
      const folded = Prisma.sql`replace(replace(lower(regexp_replace(normalize(${field}, NFKD), ${"[\u0300-\u036f]"}, '', 'g')), 'œ', 'oe'), 'æ', 'ae')`;
      return Prisma.sql`strpos(${folded}, ${normalizeMetadataSearch(filters[key]!)}) > 0`;
    });
  const exact = metadataWhere({
    documentType: filters.documentType,
    reviewFrom: filters.reviewFrom,
    reviewTo: filters.reviewTo,
  });
  if (!clauses.length) return exact;
  const matches = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "Document" WHERE "deletedAt" IS NULL AND ${Prisma.join(clauses, " AND ")}
  `);
  // The caller combines these IDs with its existing ACL and sensitivity predicates before pagination.
  return [...exact, { id: { in: matches.map(({ id }) => id) } }];
}

export function mergeMetadata(
  previous: Prisma.JsonValue | null,
  patch: Record<string, string> = {},
) {
  const next = {
    ...(previous && typeof previous === "object" && !Array.isArray(previous)
      ? previous
      : {}),
    ...patch,
  };
  if (
    validateSync(
      Object.assign(new DocumentMetadataDto(), {
        locale: "en",
        title: "Metadata",
        metadata: next,
      }),
    ).length
  )
    throw new BadRequestException(
      "Invalid metadata: maximum 20 optional text fields",
    );
  return next as Record<string, string>;
}

export const reminderDefaults = {
  enabled: true,
  leadDays: 30,
  overdueDays: 7,
  publicationRepeatDays: 0,
};
export function readReminderSettings(value: unknown) {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const number = (key: keyof typeof reminderDefaults) =>
    typeof data[key] === "number" &&
    Number.isInteger(data[key]) &&
    Number(data[key]) >= 0 &&
    Number(data[key]) <= 365
      ? Number(data[key])
      : Number(reminderDefaults[key]);
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    leadDays: number("leadDays"),
    overdueDays: number("overdueDays"),
    publicationRepeatDays: number("publicationRepeatDays"),
  };
}
