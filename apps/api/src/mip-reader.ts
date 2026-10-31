import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { readFile } from "fs/promises";
import type { IsmsRequest } from "./types";
import type { AntivirusService } from "./antivirus.service";

const maxBytes = 50 * 1024 * 1024;
const compoundFile = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
let busy = false;
export async function withMipCapacity<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (busy)
    throw new ServiceUnavailableException("MIP reader is busy; retry later");
  busy = true;
  try {
    return await operation();
  } finally {
    busy = false;
  }
}
export const isProtectedOffice = (content: Buffer, extension: string) =>
  [".xlsx", ".docx"].includes(extension) &&
  content.subarray(0, 8).equals(compoundFile);
export const isMipObjectKey = (key: string) =>
  /\/mip-[0-9a-f-]{36}\.(xlsx|docx)$/u.test(key);

export async function readMipEnvelope(
  source: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of source) {
    length += chunk.length;
    if (length > maxBytes)
      throw new BadRequestException("Protected file is too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readMipOffice(
  req: IsmsRequest,
  content: Buffer,
  extension: string,
): Promise<Buffer> {
  if (process.env.MIP_READER_ENABLED !== "true")
    throw new BadRequestException("Protected Office support is disabled");
  if (
    req.identity.source !== "trusted-proxy" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(req.identity.username)
  )
    throw new ForbiddenException(
      "Microsoft SSO is required for protected Office files",
    );
  if (!isProtectedOffice(content, extension) || content.length > maxBytes)
    throw new BadRequestException("Unsupported protected Office file");
  if (
    process.env.MIP_READER_URL !== "http://mip-reader:8080" ||
    !process.env.MIP_API_KEY_FILE
  )
    throw new ServiceUnavailableException("MIP reader is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let result: Buffer | undefined;
  try {
    const key = (await readFile(process.env.MIP_API_KEY_FILE, "utf8")).trim();
    if (!/^[A-Za-z0-9_-]{48,128}$/u.test(key)) throw new Error("Invalid key");
    const response = await fetch("http://mip-reader:8080/v1/office-preview", {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/octet-stream",
        "X-Mip-User": req.identity.username,
        "X-Mip-Extension": extension,
      },
      body: new Uint8Array(content),
    });
    if (response.status === 403)
      throw new ForbiddenException(
        "Purview denies this preview; VIEW and EXTRACT rights are required",
      );
    if (response.status === 422 || response.status === 415)
      throw new BadRequestException(
        "Unsupported encryption or protected Office file",
      );
    if (!response.ok || !response.body) throw new Error("Reader unavailable");
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > maxBytes) {
          controller.abort();
          throw new Error("Preview too large");
        }
        chunks.push(Buffer.from(chunk));
      }
      result = Buffer.concat(chunks);
    } finally {
      for (const chunk of chunks) chunk.fill(0);
    }
    if (result[0] !== 0x50 || result[1] !== 0x4b)
      throw new BadRequestException("Invalid decrypted Office format");
    return result;
  } catch (error) {
    result?.fill(0);
    if (
      error instanceof ForbiddenException ||
      error instanceof BadRequestException
    )
      throw error;
    throw new ServiceUnavailableException(
      "MIP reader unavailable; protected content was not released",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function scanMipUpload(
  req: IsmsRequest,
  content: Buffer,
  extension: string,
  sensitive: boolean,
  antivirus: AntivirusService,
) {
  if (sensitive)
    throw new BadRequestException(
      "Protected Office files cannot use ISMS watermark copies",
    );
  return withMipCapacity(async () => {
    const plain = await readMipOffice(req, content, extension);
    try {
      return await antivirus.scan(plain);
    } finally {
      plain.fill(0);
    }
  });
}
