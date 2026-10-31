import { once } from "node:events";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Request, Response } from "express";

const require = createRequire(import.meta.url);
const nestRequire = createRequire(
  require.resolve("@nestjs/platform-express/package.json"),
);
const express = nestRequire("express");
const expressRequire = createRequire(nestRequire.resolve("express"));
const multer = nestRequire("multer");
let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post("/json", (req: Request, res: Response) => res.json(req.body));
  app.post(
    "/upload",
    multer().single("file"),
    (req: Request, res: Response) => {
      res.json({ name: req.file?.originalname, size: req.file?.size });
    },
  );
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test listener");
  url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

describe("patched HTTP request parsers", () => {
  it("resolves the patched packages from the real NestJS dependency chain", () => {
    expect(nestRequire("multer/package.json").version).toBe("2.5.0");
    expect(expressRequire("body-parser/package.json").version).toBe("2.4.0");
  });

  it("still accepts compressed JSON requests", async () => {
    const response = await fetch(`${url}/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: gzipSync(JSON.stringify({ title: "Document metadata" })),
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: "Document metadata" });
  });

  it("still accepts multipart document uploads", async () => {
    const form = new FormData();
    form.append("file", new Blob(["document test"]), "document.txt");
    const response = await fetch(`${url}/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "document.txt", size: 13 });
  });
});
