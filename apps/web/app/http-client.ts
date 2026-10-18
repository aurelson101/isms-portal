import { readLocale } from "./i18n/locale";

export class RequestTimeoutError extends Error {
  constructor(readonly uncertain: boolean) {
    const messages = {
      fr: uncertain ? "D\u00e9lai d\u00e9pass\u00e9 ; v\u00e9rifiez le r\u00e9sultat avant de r\u00e9essayer." : "D\u00e9lai d\u00e9pass\u00e9 ; veuillez r\u00e9essayer.",
      en: uncertain ? "Request timed out; check the result before retrying." : "Request timed out; please try again.",
      es: uncertain ? "Tiempo agotado; compruebe el resultado antes de reintentar." : "Tiempo agotado; vuelva a intentarlo.",
      sk: uncertain ? "\u010cas vypr\u0161al; pred opakovan\u00edm skontrolujte v\u00fdsledok." : "\u010cas vypr\u0161al; sk\u00faste to znova.",
    };
    super(messages[readLocale()]);
    this.name = "RequestTimeoutError";
  }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs?: number) {
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const read = ["GET", "HEAD", "OPTIONS"].includes(method);
  const controller = new AbortController();
  const external = init.signal === undefined && input instanceof Request ? input.signal : init.signal;
  external?.throwIfAborted();
  const combine = typeof AbortSignal.any === "function";
  const abort = () => controller.abort(external?.reason);
  if (external && !combine) external.addEventListener("abort", abort, { once: true });
  const signal = external && combine ? AbortSignal.any([external, controller.signal]) : controller.signal;
  const multipart = init.body instanceof FormData || (init.body === undefined && input instanceof Request
    && /^multipart\/form-data(?:;|$)/i.test(input.headers.get("content-type") || ""));
  let timedOut = false;
  const timer = setTimeout(() => { if (!signal.aborted) { timedOut = true; controller.abort(); } }, timeoutMs ?? (multipart ? 120000 : read ? 15000 : 30000));
  try {
    return await globalThis.fetch(input, { ...init, signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(!read);
    throw error;
  } finally {
    clearTimeout(timer);
    if (!combine) external?.removeEventListener("abort", abort);
  }
}
