import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

const DOCUMENT_TYPE_KEY = "ged.documentType";
const REFERENCE_KEY = "ged.reference";

type Metadata = Record<string, string>;

const missingFields = (
  type: { requiredFields: string[]; referencePrefix: string | null },
  metadata: Metadata,
) => type.requiredFields.filter((field) => !metadata[field]?.trim());

const findType = (tx: Prisma.TransactionClient, metadata: Metadata) => {
  const slug = metadata[DOCUMENT_TYPE_KEY]?.trim();
  return slug
    ? tx.documentType.findFirst({ where: { slug, deletedAt: null } })
    : Promise.resolve(null);
};

/**
 * Applies the declared document type: assigns the next reference when the
 * type numbers documents, then rejects missing required fields. Free-text
 * types without a matching definition keep the previous, optional behaviour.
 */
export async function applyDocumentType(
  tx: Prisma.TransactionClient,
  metadata: Metadata,
) {
  const type = await findType(tx, metadata);
  if (!type) return metadata;
  let result = metadata;
  if (type.referencePrefix && !metadata[REFERENCE_KEY]?.trim()) {
    const [{ number }] = await tx.$queryRaw<Array<{ number: number }>>`
      UPDATE "DocumentType" SET "nextNumber" = "nextNumber" + 1, "updatedAt" = now()
      WHERE id = ${type.id}
      RETURNING "nextNumber" - 1 AS number`;
    result = {
      ...metadata,
      [REFERENCE_KEY]: `${type.referencePrefix}-${String(number).padStart(3, "0")}`,
    };
  }
  const missing = missingFields(type, result);
  if (missing.length)
    throw new BadRequestException({
      code: "DOCUMENT_TYPE_FIELDS_REQUIRED",
      message: `Required fields for type ${type.nameFr}: ${missing.join(", ")}`,
      fields: missing,
    });
  return result;
}

/** Blocks publication while the document type still has empty required fields. */
export async function assertDocumentTypeComplete(
  tx: Prisma.TransactionClient,
  documentId: string,
) {
  const document = await tx.document.findUnique({
    where: { id: documentId },
    select: { metadata: true },
  });
  const metadata = (document?.metadata || {}) as Metadata;
  const type = await findType(tx, metadata);
  if (!type) return;
  const missing = missingFields(type, metadata);
  if (missing.length)
    throw new ConflictException({
      code: "DOCUMENT_TYPE_FIELDS_REQUIRED",
      message: `Complete the required fields of type ${type.nameFr} before publishing: ${missing.join(", ")}`,
      fields: missing,
    });
}
