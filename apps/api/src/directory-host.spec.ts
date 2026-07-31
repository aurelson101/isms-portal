import { describe, expect, it } from "vitest";
import { validateDirectoryHosts } from "./directory-host";

describe("validateDirectoryHosts", () => {
  it.each(["10.1.1.4", "2001:db8::4", "dc04", "dc04.example.com"])(
    "accepts %s for LDAP",
    (host) => expect(() => validateDirectoryHosts("LDAP", host)).not.toThrow(),
  );

  it("requires FQDNs for every LDAPS controller", () => {
    expect(() =>
      validateDirectoryHosts("LDAPS", "dc04.example.com", "dc05.example.com"),
    ).not.toThrow();
    expect(() => validateDirectoryHosts("LDAPS", "10.1.1.4")).toThrow(
      /fully qualified hostname/,
    );
    expect(() => validateDirectoryHosts("LDAPS", "dc04")).toThrow(
      /fully qualified hostname/,
    );
  });

  it("rejects malformed LDAP hosts", () => {
    expect(() => validateDirectoryHosts("LDAP", "ldap://10.1.1.4")).toThrow(
      /valid IP address or hostname/,
    );
  });
});
