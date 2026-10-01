export type AuthConfig = {
  directoryLoginEnabled: boolean;
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  ssoPilotUrl: string | null;
};

export function returnDestination(requested: string | null, fallback = "/") {
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
