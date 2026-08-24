const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("child_process");

const prisma = new PrismaClient();
const baseline = "20260730000000_initial";

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT
      to_regclass('public."DirectoryGroup"') IS NOT NULL AS "hasSchema",
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrations"
  `;
  const state = rows[0];
  if (state.hasSchema && !state.hasMigrations) {
    console.warn(
      "Existing pre-migration schema detected; recording the validated baseline.",
    );
    const result = spawnSync(
      "npx",
      [
        "prisma",
        "migrate",
        "resolve",
        "--applied",
        baseline,
        "--schema",
        "prisma/schema.prisma",
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
