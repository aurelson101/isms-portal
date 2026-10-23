import { fetchWithTimeout as fetch } from "../http-client";
import { loginDestination } from "../auth-navigation";
import { responseMessage } from "../request-errors";

let identityCheck: Promise<boolean> | undefined;

function sessionRequiresLogin(): Promise<boolean> {
  if (!identityCheck) {
    identityCheck = fetch("/api/admin/check", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return true;
        if (!response.ok) return false;
        const identity = (await response.json()) as { isAdmin?: boolean } | null;
        return identity?.isAdmin === false;
      })
      .catch(() => false)
      .finally(() => { identityCheck = undefined; });
  }
  return identityCheck;
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (
      typeof window !== "undefined" &&
      (response.status === 401 || response.status === 403) &&
      (url.startsWith("/api/admin/") || url === "/api/health/details")
    ) {
      if (await sessionRequiresLogin()) {
        window.location.replace(loginDestination("admin"));
      }
    }
    throw new Error(await responseMessage(response, response.statusText));
  }
  return response.json() as Promise<T>;
}
