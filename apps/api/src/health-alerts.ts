import { statfs } from "node:fs/promises";

export type HealthSnapshot = {
  services: Record<string, boolean>;
  disk: { availableBytes: number; totalBytes: number } | null;
};

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
  const services: Record<string, boolean> = {};
  const [ready, disk] = await Promise.allSettled([
    fetch("http://api:3001/health/ready", { redirect: "error", signal: AbortSignal.timeout(10000) })
      .then(async response => ({ ok: response.ok, body: await response.json() })),
    statfs(process.env.DOCUMENT_STORAGE_PATH || "/data/documents")
      .then(value => ({ availableBytes: Number(value.bavail) * Number(value.bsize), totalBytes: Number(value.blocks) * Number(value.bsize) })),
  ]);
  services.api = ready.status === "fulfilled" && ready.value.ok && ready.value.body?.status === "ok";
  if (ready.status === "fulfilled") {
    for (const name of ["postgres", "redis", "documentStorage", "clamav"]) {
      services[name] = ready.value.body?.checks?.[name] === true;
    }
  }
  services.storageMetrics = disk.status === "fulfilled" && disk.value.totalBytes > 0;
  return { services, disk: disk.status === "fulfilled" ? disk.value : null };
}

export function healthIncidents(snapshot: HealthSnapshot): string[] {
  const incidents = Object.entries(snapshot.services).filter(([, healthy]) => !healthy).map(([name]) => `Service unavailable: ${name}`).sort();
  const disk = snapshot.disk;
  if (disk && Number.isFinite(disk.totalBytes) && disk.totalBytes > 0 && Number.isFinite(disk.availableBytes) && disk.availableBytes >= 0) {
    if (disk.availableBytes / disk.totalBytes < 0.1) incidents.push("Document storage has less than 10% free space.");
  } else if (!incidents.includes("Service unavailable: storageMetrics")) {
    incidents.push("Document storage capacity could not be checked.");
  }
  return incidents;
}
