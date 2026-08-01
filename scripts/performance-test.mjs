const baseUrl = process.env.PERFORMANCE_BASE_URL || "http://127.0.0.1:18080";
const username = process.env.INITIAL_ADMIN_USERNAME;
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!username || !password)
  throw new Error("Administrator test credentials are required");

const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!login.ok)
  throw new Error(`Administrator login failed with HTTP ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Administrator session cookie is missing");

const scenarios = [
  {
    name: "document search",
    path: "/api/documents?q=policy&page=1&limit=10",
    p95: 2000,
  },
  {
    name: "document pagination",
    path: "/api/documents?page=2&limit=10",
    p95: 1500,
  },
  {
    name: "large AD group list",
    path: "/api/admin/groups?q=PERF&page=5&limit=200",
    p95: 2000,
  },
];
const requests = Number(process.env.PERFORMANCE_REQUESTS || 60);
const concurrency = Number(process.env.PERFORMANCE_CONCURRENCY || 10);

for (const scenario of scenarios) {
  const timings = [];
  let failures = 0;
  for (let offset = 0; offset < requests; offset += concurrency) {
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, requests - offset) },
        async () => {
          const startedAt = performance.now();
          const response = await fetch(`${baseUrl}${scenario.path}`, {
            headers: { cookie },
          });
          timings.push(performance.now() - startedAt);
          if (!response.ok) failures += 1;
          await response.arrayBuffer();
        },
      ),
    );
  }
  timings.sort((left, right) => left - right);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  process.stdout.write(
    `${scenario.name}: p95=${p95.toFixed(1)}ms, failures=${failures}/${requests}\n`,
  );
  if (failures || p95 > scenario.p95)
    throw new Error(
      `${scenario.name} exceeded its budget (p95 <= ${scenario.p95}ms, failures = 0)`,
    );
}
