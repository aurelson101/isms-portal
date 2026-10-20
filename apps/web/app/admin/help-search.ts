export const normalizeHelpText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function filterHelpTopics<T extends { searchText: string }>(topics: T[], query: string): T[] {
  const terms = normalizeHelpText(query).split(/\s+/).filter(Boolean);
  return topics.filter((topic) => terms.every((term) => topic.searchText.includes(term)));
}
