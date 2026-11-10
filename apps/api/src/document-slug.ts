export const canonicalDocumentSlug = (title: string, id: string) => {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${normalized || "document"}-${id.slice(0, 8)}`;
};
