export type AuthConfig = {
  directoryLoginEnabled: boolean;
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  ssoPilotUrl: string | null;
};

export function returnDestination(requested: string | null, fallback = "/") {
  // eslint-disable-next-line no-control-regex -- Redirect destinations must reject control characters.
  if (!requested?.startsWith("/") || requested.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(requested)) return fallback;
  try {
    const url = new URL(requested, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function ssoDestination(value: string, requested: string | null, fallback = "/") {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/oauth2/")) return null;
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

export function loginDestination(scope: "portal" | "admin" = "portal") {
  const requested = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const destination = scope === "admin" ? adminDestination(requested) : returnDestination(requested);
  return `${scope === "admin" ? "/admin/login" : "/login"}?return=${encodeURIComponent(destination)}`;
}
