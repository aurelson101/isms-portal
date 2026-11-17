import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const run = (env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/performance-test.mjs"], {
      env: {
        ...process.env,
        INITIAL_ADMIN_USERNAME: "demo",
        INITIAL_ADMIN_PASSWORD: "test-only",
        ...env,
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => resolve({ code, output }));
  });

test("performance checks reject unsafe request and concurrency values before login", async () => {
  for (const env of [
    { PERFORMANCE_CONCURRENCY: "0" },
    { PERFORMANCE_REQUESTS: "NaN" },
    { PERFORMANCE_TIMEOUT_MS: "-1" },
  ]) {
    const result = await run(env);
    assert.equal(result.code, 1);
    assert.match(result.output, /must be an integer/);
  }
});

test("performance timings include streamed response bodies", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/api/auth/login") {
      res.writeHead(200, { "Set-Cookie": "session=demo; HttpOnly" });
      res.end("{}");
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("[");
      setTimeout(() => res.end("]"), 100);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await run({
      PERFORMANCE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      PERFORMANCE_REQUESTS: "1",
      PERFORMANCE_CONCURRENCY: "1",
    });
    assert.equal(result.code, 0, result.output);
    const timings = [...result.output.matchAll(/p95=([\d.]+)ms/g)].map(
      (match) => Number(match[1]),
    );
    assert.equal(timings.length, 3);
    assert.ok(
      timings.every((value) => value >= 80),
      result.output,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
