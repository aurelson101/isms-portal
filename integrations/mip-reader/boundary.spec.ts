import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";

it.skipIf(!process.env.ISMS_MIP_DOTNET)(
  "rejects unauthenticated, out-of-domain and non-Office requests before native decryption",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "isms-mip-boundary-"));
    const key = randomBytes(48).toString("base64url");
    const keyFile = join(directory, "key");
    const secretFile = join(directory, "secret");
    await writeFile(keyFile, key, { mode: 0o600 });
    await writeFile(secretFile, randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
    const listener = createServer();
    await new Promise<void>((done) => listener.listen(0, "127.0.0.1", done));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const child = spawn(
      process.env.ISMS_MIP_DOTNET!,
      [resolve("integrations/mip-reader/bin/Release/net10.0/MipReader.dll")],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
          MIP_TENANT_ID: "11111111-1111-1111-1111-111111111111",
          MIP_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
          MIP_ALLOWED_DOMAINS: "example.com",
          MIP_API_KEY_FILE: keyFile,
          MIP_CLIENT_SECRET_FILE: secretFile,
          MIP_CERTIFICATE_PEM_FILE: "",
        },
      },
    );
    const base = `http://127.0.0.1:${port}`;
    try {
      let live = false;
      for (let retry = 0; retry < 80; retry++) {
        try {
          live = (await fetch(base + "/health/live")).ok;
        } catch {
          /* Startup is asynchronous. */
        }
        if (live) break;
        if (child.exitCode !== null)
          throw new Error("MIP reader exited during startup");
        await new Promise((done) => setTimeout(done, 100));
      }
      expect(live).toBe(true);
      const send = (headers: Record<string, string>) =>
        fetch(base + "/v1/office-preview", {
          method: "POST",
          body: "invalid",
          headers,
        });
      expect((await send({})).status).toBe(401);
      expect(
        (
          await send({
            Authorization: `Bearer ${key}`,
            "X-Mip-User": "user@outside.invalid",
            "X-Mip-Extension": ".xlsx",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await send({
            Authorization: `Bearer ${key}`,
            "X-Mip-User": "user@example.com",
            "X-Mip-Extension": ".exe",
          })
        ).status,
      ).toBe(415);
      expect(
        (
          await send({
            Authorization: `Bearer ${key}`,
            "X-Mip-User": "user@example.com",
            "X-Mip-Extension": ".xlsx",
          })
        ).status,
      ).toBe(415);
    } finally {
      child.kill();
      await new Promise<void>((done) => {
        if (child.exitCode !== null) done();
        else child.once("exit", () => done());
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000,
);
