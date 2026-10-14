import { readFile } from "node:fs/promises";

export function healthyWorker(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return false;
  const data = value as { checkedAt?: unknown; mailRunning?: unknown; directoryRunning?: unknown };
  return typeof data.checkedAt === "number" && data.checkedAt <= now && now - data.checkedAt < 180000 && data.mailRunning === true && data.directoryRunning === true;
}

if (require.main === module) {
  void readFile("/tmp/isms-worker-health.json", "utf8").then(body => {
    process.exitCode = healthyWorker(JSON.parse(body)) ? 0 : 1;
  }).catch(() => { process.exitCode = 1; });
}
