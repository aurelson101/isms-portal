import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep, join } from "node:path";
import { createRequire } from "node:module";
const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const excelRequire = createRequire(webRequire.resolve("exceljs"));
const archiver = excelRequire("archiver");
const archiverRequire = createRequire(excelRequire.resolve("archiver"));
const glob = createRequire(archiverRequire.resolve("archiver-utils"))("glob");
const ExcelJS = webRequire("exceljs");
import { unzipSync, strFromU8 } from "fflate";
import qs from "qs";

test(
  "patched matching dependencies preserve glob and ZIP behavior",
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "isms-archive-check-"));
    try {
      await mkdir(join(directory, "nested"));
      await writeFile(join(directory, "policy.txt"), "policy");
      await writeFile(join(directory, "nested", "guide.txt"), "guide");
      await writeFile(join(directory, "nested", "excluded.txt"), "excluded");
      const options = {
        cwd: directory,
        ignore: "**/excluded.txt",
        nodir: true,
      };
      assert.deepEqual(
        glob
          .sync("**/*.txt", options)
          .map((file) => file.replaceAll("\\", "/"))
          .sort(),
        ["nested/guide.txt", "policy.txt"],
      );
      const asynchronous = await glob.glob("**/*.txt", options);
      assert.deepEqual(
        asynchronous.map((file) => file.replaceAll("\\", "/")).sort(),
        ["nested/guide.txt", "policy.txt"],
      );
      const archive = archiver("zip", { store: true });
      const chunks = [];
      const completed = new Promise((resolve, reject) => {
        archive.on("data", (chunk) => chunks.push(chunk));
        archive.on("error", reject);
        archive.on("warning", reject);
        archive.on("end", resolve);
      });
      archive.glob("**/*.txt", options);
      await archive.finalize();
      await completed;
      const files = unzipSync(Buffer.concat(chunks));
      assert.deepEqual(Object.keys(files).sort(), [
        "nested/guide.txt",
        "policy.txt",
      ]);
      assert.equal(strFromU8(files["nested/guide.txt"]), "guide");
    } finally {
      const target = resolve(directory);
      assert(
        target.startsWith(resolve(tmpdir()) + sep) &&
          target.includes("isms-archive-check-"),
      );
      await rm(target, { recursive: true, force: true });
    }
  },
);

test("ExcelJS round trips protected sheets, saved filters and streaming ZIP archives", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Classification");
  sheet.addRows([
    ["Owner", "Classification"],
    ["Alice", "Internal"],
    ["Bob", "Public"],
  ]);
  sheet.autoFilter = "A1:B3";
  sheet.getRow(3).hidden = true;
  await sheet.protect("test-only", { autoFilter: true });
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  const result = restored.getWorksheet("Classification");
  assert.equal(result.autoFilter, "A1:B3");
  assert.equal(result.getRow(3).hidden, true);
  assert.equal(result.getCell("B2").value, "Internal");
  const { PassThrough, Readable } = await import("node:stream");
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: true,
  });
  const streamedSheet = writer.addWorksheet("Classification");
  streamedSheet.addRow(["Owner", "Classification"]).commit();
  streamedSheet.addRow(["Alice", "Internal"]).commit();
  streamedSheet.addRow(["Bob", "Public"]).commit();
  streamedSheet.commit();
  await writer.commit();
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(
    Readable.from([Buffer.concat(chunks)]),
    {},
  );
  let rows = 0;
  for await (const worksheet of reader)
    for await (const row of worksheet) {
      assert(row.number > 0);
      rows++;
    }
  assert.equal(rows, 3);
});

test("query serialization tolerates an uncallable own toString", () => {
  assert.doesNotThrow(() =>
    qs.stringify({ a: [{ toString: "x" }] }, { arrayFormat: "comma" }),
  );
  assert.equal(
    qs.stringify({ a: ["one", "two"] }, { arrayFormat: "comma" }),
    "a=one%2Ctwo",
  );
});
