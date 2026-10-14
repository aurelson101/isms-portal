import { describe, expect, it } from "vitest";
import { categoryOptions, documentPage, latestVersion, translationFields, validateUpload, type ModeratorDocument } from "./document-model";

const document: ModeratorDocument = {
  id: "doc", status: "PUBLISHED", space: { id: "space", nameFr: "Documents", nameEn: "Documents" }, category: null,
  translations: [{ locale: "fr", title: "Politique", description: "FR" }, { locale: "en", title: "Policy", description: "" }],
  versions: [{ id: "v3", locale: "en", version: 3 }, { id: "v1", locale: "fr", version: 1 }],
};
const categories = [{ id: "root", parentId: null, nameFr: "Voyages", nameEn: "Travel" }, { id: "child", parentId: "root", nameFr: "International", nameEn: "International" }];
function upload() {
  const data = new FormData();
  data.set("file", new File(["%PDF"], "policy.PDF"));
  data.set("title", " Policy "); data.set("changeSummary", " Updated ");
  return data;
}

describe("moderator document model", () => {
  it("uses publication chronology across languages rather than comparing unrelated version counters", () => {
    const document = { versions: [{ id: "en", locale: "en", version: 5, createdAt: "2025-01-01" }, { id: "fr", locale: "fr", version: 1, createdAt: "2026-10-14" }] };
    expect(latestVersion(document)?.id).toBe("fr");
  });
  it("retains the administrator's optional summary while sharing file validation", () => {
    const data = upload(); data.set("changeSummary", "");
    expect(validateUpload(data, "en", { requireSummary: false })).toBe(data);
    expect(() => validateUpload(data, "en")).toThrow("required");
  });
  it("selects the latest unsorted version", () => expect(latestVersion(document)?.id).toBe("v3"));
  it("handles documents without versions", () => expect(latestVersion({ ...document, versions: [] })).toBeUndefined());
  it("does not reorder source versions", () => { const before = [...document.versions]; latestVersion(document); expect(document.versions).toEqual(before); });
  it("preserves intentionally empty translations", () => expect(translationFields(document, "en")).toEqual({ title: "Policy", description: "" }));
  it.each(["es", "sk"] as const)("uses English document metadata for the %s interface", (locale) => expect(translationFields(document, locale)).toEqual({ title: "Policy", description: "" }));
  it("keeps title and description from the same translation", () => expect(translationFields({ ...document, translations: [document.translations[0], { locale: "en", title: "", description: "English description" }] }, "en")).toEqual({ title: "", description: "English description" }));
  it("falls back for missing translations", () => expect(translationFields({ ...document, translations: document.translations.slice(0, 1) }, "en").description).toBe("FR"));
  it("handles absent translations", () => expect(translationFields({ ...document, translations: [] }, "en")).toEqual({ title: "", description: "" }));
  it("accepts legacy list responses", () => expect(documentPage([document], 1)).toEqual({ items: [document], page: 1, totalPages: 1 }));
  it("resets stale pages for legacy list responses", () => expect(documentPage([document], 4)).toEqual({ items: [document], page: 1, totalPages: 1 }));
  it("clamps stale pagination", () => expect(documentPage({ items: [], page: 4, totalPages: 2 }, 4).page).toBe(2));
  it("rejects malformed list responses", () => expect(() => documentPage({ items: {} }, 1)).toThrow("Invalid document response"));
  it("normalizes invalid pagination metadata", () => expect(documentPage({ items: [], page: "2", totalPages: -1 }, 2)).toEqual({ items: [], page: 1, totalPages: 1 }));
  it("builds English category paths", () => expect(categoryOptions(categories, "en")[1].label).toBe("Travel / International"));
  it("builds French category paths", () => expect(categoryOptions(categories, "fr")[1].label).toBe("Voyages / International"));
  it("handles missing category parents", () => expect(categoryOptions([categories[1]], "en")[0].label).toBe("International"));
  it("terminates cyclic category paths", () => expect(categoryOptions([{ ...categories[0], parentId: "child" }, categories[1]], "en")[0].label).toBe("International / Travel"));
  it("accepts uppercase extensions and trims values", () => { const data = validateUpload(upload(), "en"); expect(data.get("title")).toBe("Policy"); expect(data.get("changeSummary")).toBe("Updated"); });
  it("rejects overlong titles", () => { const data = upload(); data.set("title", "x".repeat(256)); expect(() => validateUpload(data, "en")).toThrow("allowed length"); });
  it("rejects overlong summaries", () => { const data = upload(); data.set("changeSummary", "x".repeat(2001)); expect(() => validateUpload(data, "en")).toThrow("allowed length"); });
  it("rejects overlong descriptions before sending a file", () => { const data = upload(); data.set("description", "x".repeat(2001)); expect(() => validateUpload(data, "en")).toThrow("allowed length"); });
  it("accepts descriptions at the API length limit", () => { const data = upload(); data.set("description", "x".repeat(2000)); expect(validateUpload(data, "en")).toBe(data); });
  it("accepts exact field length limits", () => { const data = upload(); data.set("title", "x".repeat(255)); data.set("changeSummary", "x".repeat(2000)); expect(validateUpload(data, "en")).toBe(data); });
});
