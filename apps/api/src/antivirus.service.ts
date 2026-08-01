import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createConnection } from "net";
import { antivirusDuration } from "./metrics";

export type AntivirusResult =
  | { status: "CLEAN" }
  | { status: "INFECTED"; signature: string }
  | { status: "ERROR"; signature: string };

@Injectable()
export class AntivirusService {
  scan(content: Buffer): Promise<AntivirusResult> {
    const startedAt = process.hrtime.bigint();
    const observe = (result: string) =>
      antivirusDuration.observe(
        { result },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      );
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: process.env.CLAMAV_HOST || "clamav",
        port: Number(process.env.CLAMAV_PORT || 3310),
      });
      const chunks: Buffer[] = [];
      const timeout = Number(process.env.CLAMAV_TIMEOUT_MS || 30000);
      socket.setTimeout(timeout);
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < content.length; offset += 65536) {
          const chunk = content.subarray(
            offset,
            Math.min(offset + 65536, content.length),
          );
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("end", () => {
        const response = Buffer.concat(chunks)
          .toString("utf8")
          .replace(/\0/g, "")
          .trim();
        if (response.endsWith("OK")) {
          observe("clean");
          return resolve({ status: "CLEAN" });
        }
        const infected = response.match(/: (.+) FOUND$/);
        if (infected) {
          observe("infected");
          return resolve({ status: "INFECTED", signature: infected[1] });
        }
        observe("error");
        resolve({
          status: "ERROR",
          signature: response || "Unknown ClamAV response",
        });
      });
      socket.on("timeout", () => {
        observe("timeout");
        socket.destroy();
        reject(new ServiceUnavailableException("ClamAV scan timed out"));
      });
      socket.on("error", (error) => {
        observe("unavailable");
        reject(
          new ServiceUnavailableException(
            `ClamAV unavailable: ${error.message}`,
          ),
        );
      });
    });
  }
}
