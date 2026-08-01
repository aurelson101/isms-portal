const { PrismaClient } = require("@prisma/client");
const { createHash } = require("crypto");
const { readFile } = require("fs/promises");
const { resolve, sep } = require("path");

const prisma = new PrismaClient();
const root = resolve(process.env.DOCUMENT_STORAGE_PATH || "/data/documents");

async function main() {
  const files = await prisma.storedFile.findMany({
    select: { objectKey: true, sha256: true, size: true },
  });
  if (!files.length) throw new Error("No stored file metadata found");
  for (const file of files) {
    const target = resolve(root, file.objectKey);
    if (!target.startsWith(`${root}${sep}`))
      throw new Error("Unsafe storage key");
    const content = await readFile(target);
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (sha256 !== file.sha256 || BigInt(content.length) !== file.size)
      throw new Error(`Stored file integrity mismatch: ${file.objectKey}`);
  }
  process.stdout.write(
    `${files.length} stored files match database sizes and SHA-256 hashes.\n`,
  );
}

main().finally(() => prisma.$disconnect());
