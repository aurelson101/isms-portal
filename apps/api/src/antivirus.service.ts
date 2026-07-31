import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createConnection } from "net";

export type AntivirusResult =
  | { status: "CLEAN" }
  | { status: "INFECTED"; signature: string }
  | { status: "ERROR"; signature: string };

@Injectable()
export class AntivirusService {
  scan(content: Buffer): Promise<AntivirusResult> {
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
        if (response.endsWith("OK")) return resolve({ status: "CLEAN" });
        const infected = response.match(/: (.+) FOUND$/);
        if (infected)
          return resolve({ status: "INFECTED", signature: infected[1] });
        resolve({
          status: "ERROR",
          signature: response || "Unknown ClamAV response",
        });
      });
      socket.on("timeout", () => {
        socket.destroy();
        reject(new ServiceUnavailableException("ClamAV scan timed out"));
      });
      socket.on("error", (error) =>
        reject(
          new ServiceUnavailableException(
            `ClamAV unavailable: ${error.message}`,
          ),
        ),
      );
    });
  }
}
