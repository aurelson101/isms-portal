export type AuthConfig = {
  directoryLoginEnabled: boolean;
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  ssoPilotUrl: string | null;
};

export function ssoDestination(value: string, requested: string | null, fallback = "/") {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/oauth2/")) return null;
    const destination = new URL(requested || fallback, window.location.origin);
    url.searchParams.set("rd", destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}` : fallback);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
