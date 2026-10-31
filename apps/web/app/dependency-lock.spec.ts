import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
  readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
);
const workspaceRequire = createRequire(
  new URL("../package.json", import.meta.url),
);

describe("security-sensitive framework dependency resolution", () => {
  it("keeps the workspace and lock declarations aligned", () => {
    expect(lock.packages["apps/web"].dependencies.next).toBe(
      manifest.dependencies.next,
    );
  });
  it("locks the exact Next.js version requested by the application", () => {
    const installed =
      lock.packages["apps/web/node_modules/next"] ||
      lock.packages["node_modules/next"];
    expect(installed?.version).toBe(manifest.dependencies.next);
  });
  it("actually installs that version instead of retaining a vulnerable nested copy", () => {
    expect(workspaceRequire("next/package.json").version).toBe(
      manifest.dependencies.next,
    );
  });
});
