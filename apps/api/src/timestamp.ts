import { randomBytes } from "node:crypto";

// Minimal DER helpers for RFC 3161 (Time-Stamp Protocol) requests.
const length = (size: number) => {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  for (let value = size; value > 0; value >>= 8) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag: number, value: Buffer) =>
  Buffer.concat([Buffer.from([tag]), length(value.length), value]);
const sequence = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
const integer = (value: Buffer) =>
  tlv(0x02, value[0] & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value);
const oid = (dotted: string) => {
  const [first, second, ...rest] = dotted.split(".").map(Number);
  const bytes = [first * 40 + second];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = part >> 7; value > 0; value >>= 7)
      chunk.unshift((value & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
};
const SHA256_OID = "2.16.840.1.101.3.4.2.1";

export function timestampRequest(
  sha256Hex: string,
  nonce: Buffer,
  policy?: string,
) {
  const digest = Buffer.from(sha256Hex, "hex");
  if (digest.length !== 32) throw new Error("A SHA-256 digest is required");
  return sequence(
    integer(Buffer.from([1])),
    sequence(
      sequence(oid(SHA256_OID), Buffer.from([0x05, 0x00])),
      tlv(0x04, digest),
    ),
    ...(policy ? [oid(policy)] : []),
    integer(nonce),
    Buffer.from([0x01, 0x01, 0xff]),
  );
}

const readTlv = (buffer: Buffer, offset: number) => {
  const tag = buffer[offset];
  let size = buffer[offset + 1];
  let header = 2;
  if (size & 0x80) {
    const count = size & 0x7f;
    if (count < 1 || count > 4) throw new Error("Unsupported DER length");
    size = 0;
    for (let index = 0; index < count; index++)
      size = size * 256 + buffer[offset + 2 + index];
    header += count;
  }
  const end = offset + header + size;
  if (end > buffer.length) throw new Error("Truncated DER value");
  return { tag, start: offset + header, end };
};

const generalizedTime = (token: Buffer) => {
  // The first GeneralizedTime of a SignedData token is TSTInfo.genTime.
  for (let index = 0; index + 17 <= token.length; index++) {
    if (token[index] !== 0x18) continue;
    const size = token[index + 1];
    if (size < 15 || size > 23) continue;
    const text = token.subarray(index + 2, index + 2 + size).toString("latin1");
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/u.exec(
      text,
    );
    if (match)
      return new Date(
        `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] || ""}Z`,
      );
  }
  return null;
};

/** Parses a TimeStampResp and returns the token once the response is checked. */
export function parseTimestampResponse(
  response: Buffer,
  sha256Hex: string,
  nonce: Buffer,
) {
  const outer = readTlv(response, 0);
  if (outer.tag !== 0x30) throw new Error("Invalid time-stamp response");
  const status = readTlv(response, outer.start);
  const statusValue = readTlv(response, status.start);
  const code = response[statusValue.end - 1];
  if (statusValue.tag !== 0x02 || code > 1)
    throw new Error(`Time-stamp request rejected (status ${code})`);
  if (status.end >= outer.end) throw new Error("Time-stamp token missing");
  const tokenTlv = readTlv(response, status.end);
  const token = Buffer.from(response.subarray(status.end, tokenTlv.end));
  if (!token.includes(Buffer.from(sha256Hex, "hex")))
    throw new Error("Time-stamp token does not cover the requested hash");
  if (!token.includes(nonce)) throw new Error("Time-stamp nonce mismatch");
  return { token, genTime: generalizedTime(token) };
}

export type TimestampConfig = {
  url: string;
  username?: string;
  password?: string;
  policyOid?: string;
};

/** Fallback when no administrator setting exists (TSA_* variables). */
export const environmentTimestampConfig = (): TimestampConfig | null => {
  const url = process.env.TSA_URL?.trim();
  return url
    ? {
        url,
        username: process.env.TSA_USERNAME || undefined,
        password: process.env.TSA_PASSWORD || undefined,
        policyOid: process.env.TSA_POLICY_OID || undefined,
      }
    : null;
};

/**
 * Requests a time-stamp token from the configured authority, for instance a
 * qualified eIDAS provider. Returns null when time-stamping is disabled.
 */
export async function requestTimestamp(
  sha256Hex: string,
  config: TimestampConfig | null,
) {
  if (!config) return null;
  const url = config.url;
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f;
  const headers: Record<string, string> = {
    "Content-Type": "application/timestamp-query",
    Accept: "application/timestamp-reply",
  };
  if (config.username)
    headers.Authorization = `Basic ${Buffer.from(
      `${config.username}:${config.password || ""}`,
    ).toString("base64")}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: timestampRequest(sha256Hex, nonce, config.policyOid),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Time-stamp authority returned HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  return { url, ...parseTimestampResponse(body, sha256Hex, nonce) };
}
