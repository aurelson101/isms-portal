export async function responseMessage(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  const message = body && typeof body === "object" && "message" in body ? body.message : null;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const text = message.filter((item): item is string => typeof item === "string").join(". ");
    if (text) return text;
  }
  return fallback;
}
