import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 30);
const OCR_LANGUAGES = process.env.OCR_LANGUAGES || "fra+eng";

const run = (command: string, args: string[], timeout: number) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

export class OcrUnavailableError extends Error {}

/**
 * Renders scanned PDF pages (pdftoppm) and recognises their text (tesseract).
 * Files only live in a private temporary directory that is always removed.
 */
export async function ocrPdf(buffer: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "isms-ocr-"));
  try {
    const input = join(directory, "input.pdf");
    await writeFile(input, buffer, { mode: 0o600 });
    try {
      await run(
        "pdftoppm",
        [
          "-r",
          "200",
          "-gray",
          "-png",
          "-l",
          String(OCR_MAX_PAGES),
          input,
          join(directory, "page"),
        ],
        120_000,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new OcrUnavailableError("pdftoppm is not installed");
      throw error;
    }
    const images = (await readdir(directory))
      .filter((name) => name.startsWith("page") && name.endsWith(".png"))
      .sort((left, right) =>
        left.localeCompare(right, "en", { numeric: true }),
      );
    const pages: string[] = [];
    for (const image of images) {
      try {
        pages.push(
          await run(
            "tesseract",
            [join(directory, image), "stdout", "-l", OCR_LANGUAGES],
            120_000,
          ),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new OcrUnavailableError("tesseract is not installed");
        throw error;
      }
    }
    return pages.join("\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
