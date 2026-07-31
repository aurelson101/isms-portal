import { isIP } from "net";

const isHostname = (value: string) =>
  value.length <= 253 &&
  value
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    );

const isFqdn = (value: string) =>
  value.includes(".") && !isIP(value) && isHostname(value);

export const validateDirectoryHosts = (
  protocol: "LDAP" | "LDAPS",
  primaryHost: string,
  secondaryHost?: string,
) => {
  const hosts = [primaryHost, secondaryHost].filter((host): host is string =>
    Boolean(host),
  );
  for (const host of hosts) {
    if (protocol === "LDAP" && (isIP(host) || isHostname(host))) continue;
    if (protocol === "LDAPS" && isFqdn(host)) continue;
    throw new Error(
      protocol === "LDAPS"
        ? "LDAPS controllers must use a fully qualified hostname, for example dc04.example.com"
        : "LDAP controllers must use a valid IP address or hostname",
    );
  }
};
