const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = Array.from({ length: 2000 }, (_, index) => ({
    name: `PERF-GROUP-${String(index).padStart(4, "0")}`,
    distinguishedName: `CN=PERF-GROUP-${String(index).padStart(4, "0")},OU=Performance,DC=example,DC=invalid`,
    description: "Disposable performance-test directory group",
    active: true,
    memberCount: index % 250,
  }));
  await prisma.directoryGroup.createMany({ data: rows, skipDuplicates: true });
  process.stdout.write(`${rows.length} performance groups are available.\n`);
}

main().finally(() => prisma.$disconnect());
