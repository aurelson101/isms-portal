import { fetchWithTimeout as fetch } from "../http-client";
import { loginDestination } from "../auth-navigation";
import { responseMessage } from "../request-errors";

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
        window.location.replace(loginDestination("admin"));
      }
    }
    throw new Error(await responseMessage(response, response.statusText));
  }
  return response.json() as Promise<T>;
}
