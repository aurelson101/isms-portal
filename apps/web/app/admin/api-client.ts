import { fetchWithTimeout as fetch } from "../http-client";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (
      typeof window !== "undefined" &&
      (response.status === 401 || response.status === 403) &&
      (url.startsWith("/api/admin/") || url === "/api/health/details")
    ) {
      const identityResponse = await fetch("/api/admin/check", {
        cache: "no-store",
      }).catch(() => null);
      const identity = identityResponse?.ok
        ? ((await identityResponse.json().catch(() => null)) as {
            isAdmin?: boolean;
          } | null)
        : null;
      if (!identity?.isAdmin) {
        const requested = `${window.location.pathname}${window.location.hash}`;
        window.location.replace(
          `/admin/login?return=${encodeURIComponent(requested)}`,
        );
      }
    }
    const payload = (await response
      .json()
      .catch(() => ({ message: response.statusText }))) as {
      message?: string | string[];
    };
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(", ")
        : payload.message || response.statusText,
    );
  }
  return response.json() as Promise<T>;
}
