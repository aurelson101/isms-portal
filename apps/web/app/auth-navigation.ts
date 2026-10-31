export type AuthConfig = {
  directoryLoginEnabled: boolean;
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  ssoPilotUrl: string | null;
};

export function returnDestination(requested: string | null, fallback = "/") {
  // eslint-disable-next-line no-control-regex -- Redirect destinations must reject control characters.
  const invalidCharacters = /[\\\u0000-\u001f\u007f]/;
  if (
    !requested?.startsWith("/") ||
    requested.startsWith("//") ||
    invalidCharacters.test(requested)
  )
    return fallback;
  try {
    const url = new URL(requested, window.location.origin);
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("//") || invalidCharacters.test(path)) return fallback;
    const route = new URL(path, window.location.origin).pathname.replace(
      /\/+/g,
      "/",
    );
    if (
      /^\/(?:login|admin\/login|moderator\/login|oauth2)(?:\/|$)/i.test(route)
    )
      return fallback;
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function ssoDestination(
  value: string,
  requested: string | null,
  fallback = "/",
) {
  try {
    const url = new URL(value, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith("/oauth2/")
    )
      return null;
    url.searchParams.set("rd", returnDestination(requested, fallback));
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function adminDestination(requested: string | null) {
  const destination = returnDestination(requested, "/admin");
  return /^\/admin(?:[/?#]|$)/.test(destination) ? destination : "/admin";
}

export function configuredSsoDestination(
  config: AuthConfig,
  requested: string | null,
  scope: "portal" | "admin" = "portal",
) {
  const endpoint = config.ssoPilotUrl || config.ssoLoginUrl;
  if (!config.ssoEnabled || !endpoint) return null;
  return ssoDestination(
    endpoint,
    scope === "admin" ? adminDestination(requested) : requested,
  );
}

export function loginDestination(scope: "portal" | "admin" = "portal") {
  const requested = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const destination =
    scope === "admin"
      ? adminDestination(requested)
      : returnDestination(requested);
  return `${scope === "admin" ? "/admin/login" : "/login"}?return=${encodeURIComponent(destination)}`;
}
