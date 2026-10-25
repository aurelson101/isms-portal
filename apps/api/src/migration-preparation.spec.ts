import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../prisma/prepare-migrations.js", import.meta.url),
  "utf8",
);

async function run(hasSchema: boolean, hasMigrations: boolean) {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ hasSchema, hasMigrations }]),
    $disconnect: disconnect,
  };
  const spawn = vi.fn().mockReturnValue({ status: 0 });
  const resolve = vi.fn().mockReturnValue("/runtime/prisma/build/index.js");
  const requireMock = Object.assign(
    (name: string) => {
      if (name === "@prisma/client")
        return {
          PrismaClient: function () {
            return prisma;
          },
        };
      if (name === "child_process") return { spawnSync: spawn };
      throw new Error(`Unexpected module: ${name}`);
    },
    { resolve },
  );
  runInNewContext(source, {
    require: requireMock,
    process: { execPath: "/runtime/node", exit: vi.fn() },
    console: { warn: vi.fn(), error: vi.fn() },
  });
  await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
  return { spawn, resolve };
}

describe("migration preparation in the production image", () => {
  it("runs the installed Prisma CLI with Node when recording a legacy baseline", async () => {
    const { spawn, resolve } = await run(true, false);
    expect(resolve).toHaveBeenCalledWith("prisma/build/index.js");
    expect(spawn).toHaveBeenCalledWith(
      "/runtime/node",
      [
        "/runtime/prisma/build/index.js",
        "migrate",
        "resolve",
        "--applied",
        "20260730000000_initial",
        "--schema",
        "prisma/schema.prisma",
      ],
      { stdio: "inherit" },
    );
  });
  it("does not baseline an empty database", async () => {
    expect((await run(false, false)).spawn).not.toHaveBeenCalled();
  });
  it("does not rebaseline a database with migration history", async () => {
    expect((await run(true, true)).spawn).not.toHaveBeenCalled();
  });
});
