/** Convert supported SharePoint video links to the Microsoft embedded player. */
export function sharePointVideoEmbedUrl(value: string): string | null {
  try {
    const source = new URL(value);
    if (
      source.protocol !== "https:" ||
      source.username ||
      source.password ||
      source.port ||
      !/^[a-z0-9][a-z0-9-]*\.sharepoint\.com$/i.test(source.hostname)
    ) {
      return null;
    }

    const existingPlayer = /\/_layouts\/15\/embed\.aspx$/i.test(
      source.pathname,
    );
    if (
      !existingPlayer &&
      !/^\/:v:\/r\//i.test(source.pathname) &&
      !/\.(mp4|webm|mov|m4v)$/i.test(source.pathname)
    ) {
      return null;
    }

    const identifier = existingPlayer
      ? source.searchParams.get("UniqueId")?.replace(/^\{(.*)\}$/, "$1")
      : source.searchParams.get("d")?.match(/^w([a-f0-9]{32})$/i)?.[1];
    if (!identifier) return null;
    const compact = identifier.replace(/-/g, "");
    if (!/^[a-f0-9]{32}$/i.test(compact)) return null;
    const guid = compact.replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
      "$1-$2-$3-$4-$5",
    );
    const path = source.pathname.replace(/^\/:v:\/r(?=\/)/i, "");
    const site = existingPlayer
      ? path.replace(/\/_layouts\/15\/embed\.aspx$/i, "")
      : path.match(/^\/(?:sites|teams)\/[^/]+/i)?.[0] || "";
    const player = new URL(`${site}/_layouts/15/embed.aspx`, source.origin);
    player.searchParams.set("UniqueId", guid);
    return player.href;
  } catch {
    return null;
  }
}
