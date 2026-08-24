export type SessionFailure =
  | "unauthorized"
  | "forbidden"
  | "timeout"
  | "unavailable";

export class SessionError extends Error {
  constructor(public readonly reason: SessionFailure) {
    super(reason);
  }
}

let pendingIdentity: Promise<unknown> | null = null;

function fetchIdentity(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  return fetch("/api/me?refresh=1", {
    cache: "no-store",
    signal: controller.signal,
  })
    .then(async (response) => {
      performance.measure("isms.identity-check", {
        start: startedAt,
        end: performance.now(),
        detail: { status: response.status },
      });
      if (response.status === 401) throw new SessionError("unauthorized");
      if (response.status === 403) throw new SessionError("forbidden");
      if (!response.ok) throw new SessionError("unavailable");
      return response.json();
    })
    .catch((error: unknown) => {
      if (error instanceof SessionError) throw error;
      if (controller.signal.aborted) throw new SessionError("timeout");
      throw new SessionError("unavailable");
    })
    .finally(() => window.clearTimeout(timeout));
}

function waitForCaller<T>(request: Promise<unknown>, signal?: AbortSignal) {
  if (!signal) return request as Promise<T>;
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value as T);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export function getPortalIdentity<T>(options?: {
  force?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  if (!pendingIdentity || options?.force) {
    const request = fetchIdentity(options?.timeoutMs ?? 8_000);
    pendingIdentity = request;
    const clearPending = () => {
      if (pendingIdentity === request) pendingIdentity = null;
    };
    void request.then(clearPending, clearPending);
  }
  return waitForCaller<T>(pendingIdentity, options?.signal);
}

function currentProtectedDestination() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function loginDestination() {
  return `/login?return=${encodeURIComponent(currentProtectedDestination())}`;
}
