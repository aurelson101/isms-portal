import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryService } from "./directory.service";
import { Client } from "ldapts";
import { lookup } from "dns/promises";
import { connect } from "tls";

const mocks = vi.hoisted(() => ({
  clients: [] as Array<{ host: string; bind: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; unbind: ReturnType<typeof vi.fn> }>,
  failedHosts: new Set<string>(),
  tlsFails: false,
  search: vi.fn(),
}));
vi.mock("ldapts", () => ({
  escapeFilter: (value: string) => value,
  Client: vi.fn(function (options: { url: string }) {
    const host = new URL(options.url).hostname;
    const client = {
      host,
      bind: vi.fn(async () => { if (mocks.failedHosts.has(host)) throw new Error("Certificate validation failed"); }),
      search: mocks.search,
      unbind: vi.fn().mockResolvedValue(undefined),
    };
    mocks.clients.push(client);
    return client;
  }),
}));
vi.mock("dns/promises", () => ({ lookup: vi.fn().mockResolvedValue({ address: "192.0.2.10" }) }));
vi.mock("net", () => ({ createConnection: vi.fn(() => {
  const socket = { setTimeout: vi.fn(), destroy: vi.fn(), once: vi.fn((event: string, callback: () => void) => {
    if (event === "connect") queueMicrotask(callback);
    return socket;
  }) };
  return socket;
}) }));
vi.mock("tls", () => ({ connect: vi.fn((_options: unknown, ready: () => void) => {
  let fail: (error: Error) => void;
  const socket = { setTimeout: vi.fn(), destroy: vi.fn(), getPeerCertificate: () => ({ subject: { CN: "dc02.example.test" } }), once: vi.fn((event: string, callback: (error: Error) => void) => {
    if (event === "error") fail = callback;
    return socket;
  }) };
  queueMicrotask(() => mocks.tlsFails ? fail(new Error("TLS failure")) : ready());
  return socket;
}) }));

const connection = {
  id: "directory", primaryHost: "dc01.example.test", secondaryHost: "dc02.example.test",
  port: 636, protocol: "LDAPS", retries: 0, timeoutMs: 500,
  caCertificate: { pem: "trusted-ca" }, bindDn: "service", encryptedBindSecret: "encrypted",
  baseDn: "DC=example,DC=test", userFilter: "(objectClass=user)", groupFilter: "(objectClass=group)",
  usernameAttribute: "mail", emailAttribute: "mail", groupAttribute: "cn",
};
const prisma = { directoryConnection: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } };
const service = new DirectoryService(prisma as never, { decrypt: () => "credential" } as never);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.clients.length = 0;
  mocks.failedHosts.clear();
  mocks.tlsFails = false;
  mocks.search.mockReset().mockResolvedValue({ searchEntries: [{}] });
  prisma.directoryConnection.findUnique.mockResolvedValue(connection);
});

describe("directory diagnostics follow the authenticated endpoint", () => {
  it("uses the primary when it is healthy", async () => {
    const result = await service.test(connection.id);
    expect(result.status).toBe("SUCCESS");
    expect(result.results.bind).toEqual({ ok: true, host: connection.primaryHost, fallback: false });
    expect(lookup).toHaveBeenCalledWith(connection.primaryHost);
    expect(mocks.clients[0].unbind).toHaveBeenCalledOnce();
  });
  it("tests the secondary after primary certificate failure, preserving strict TLS", async () => {
    mocks.failedHosts.add(connection.primaryHost);
    const result = await service.test(connection.id);
    expect(result.status).toBe("SUCCESS");
    expect(result.results.bind).toEqual({ ok: true, host: connection.secondaryHost, fallback: true });
    expect(lookup).toHaveBeenCalledWith(connection.secondaryHost);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: connection.secondaryHost, servername: connection.secondaryHost, rejectUnauthorized: true, ca: ["trusted-ca"] }), expect.any(Function));
    for (const [options] of vi.mocked(Client).mock.calls) expect(options.tlsOptions?.rejectUnauthorized).toBe(true);
    expect(mocks.clients.every(client => client.unbind.mock.calls.length === 1)).toBe(true);
  });
  it("reports failure when neither endpoint authenticates", async () => {
    mocks.failedHosts.add(connection.primaryHost); mocks.failedHosts.add(connection.secondaryHost);
    const result = await service.test(connection.id);
    expect(result.status).toBe("ERROR");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each(["TLS", "search"])("closes the authenticated session on a later %s failure", async stage => {
    if (stage === "TLS") mocks.tlsFails = true;
    else mocks.search.mockRejectedValueOnce(new Error("Search unavailable"));
    expect((await service.test(connection.id)).status).toBe("ERROR");
    expect(mocks.clients[0].unbind).toHaveBeenCalledOnce();
  });
});
