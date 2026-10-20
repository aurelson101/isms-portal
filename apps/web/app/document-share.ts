export function documentShareUrl(origin: string, slug: string): string {
  return new URL(`/documents/${encodeURIComponent(slug)}`, origin).href;
}

export async function copyDocumentLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
