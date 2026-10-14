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
  const external = init.signal;
  const abort = () => controller.abort(external?.reason);
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs ?? (init.body instanceof FormData ? 120000 : read ? 15000 : 30000));
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(!read);
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}
