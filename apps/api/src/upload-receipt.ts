import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PrismaService } from "./prisma.service";

export function uploadReceipt(identity: string, body: Record<string, string>, file: Express.Multer.File) {
  if (!body.uploadRequestId) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.uploadRequestId)) throw new BadRequestException("Invalid upload request ID");
  // The version primary key makes the receipt durable and concurrent retries unique.
  const hash = createHash("sha256").update(`${identity.toLowerCase()}\0${body.uploadRequestId}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const fields = Object.entries(body).filter(([key]) => key !== "uploadRequestId").sort(([a], [b]) => a.localeCompare(b));
  const fingerprint = createHash("sha256").update(JSON.stringify([fields, file.originalname, file.mimetype])).update(file.buffer).digest("hex");
  return { id, fingerprint };
}

export async function findUploadReceipt(prisma: PrismaService, receipt: ReturnType<typeof uploadReceipt>) {
  if (!receipt) return null;
  const version = await prisma.documentVersion.findUnique({
    where: { id: receipt.id },
    select: { changeDetails: true, storedFile: { select: { objectKey: true } }, document: { include: { translations: true, versions: true } } },
  });
  if (!version) return null;
  const details = version.changeDetails;
  if (!details || typeof details !== "object" || Array.isArray(details) || details.uploadRequestHash !== receipt.fingerprint || version.document.deletedAt) {
    throw new ConflictException("Upload request changed or document deleted; check the document list");
  }
  return { document: version.document, objectKey: version.storedFile.objectKey };
}
