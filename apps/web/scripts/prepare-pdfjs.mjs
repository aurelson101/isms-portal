import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const target = fileURLToPath(new URL("../public/pdfjs/", import.meta.url));
mkdirSync(target, { recursive: true });
cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
cpSync(join(source, "build/pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
for (const directory of ["cmaps", "standard_fonts"]) {
  cpSync(join(source, directory), join(target, directory), { recursive: true });
}
