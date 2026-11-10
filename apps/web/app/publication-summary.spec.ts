import { describe, expect, it } from "vitest";
import { publicationSummary } from "./publication-summary";

const document = {
  translations: [
    { locale: "fr", title: "Guide français" },
    { locale: "en", title: "English guide" },
  ],
  versions: [{ locale: "fr" }, { locale: "fr" }, { locale: "en" }],
  space: { nameFr: "Documentation", nameEn: "Documents" },
  category: { nameFr: "Guides", nameEn: "Guides" },
  suppressEmailNotifications: true,
};
describe("publication summary", () => {
  it("summarizes languages, classification and disabled notifications without claiming a delivery", () => {
    const summary = publicationSummary(document, "fr");
    expect(summary).toContain("Titre: Guide français");
    expect(summary).toContain("Langue(s): FR, EN");
    expect(summary).toContain("Documentation / Guides");
    expect(summary).toContain("Notifications e-mail: Désactivées");
  });
  it("uses link metadata languages and clearly states that normal delivery follows ACLs and workflow", () => {
    const summary = publicationSummary(
      {
        ...document,
        versions: [],
        externalUrl: "https://example.test/guide",
        suppressEmailNotifications: false,
      },
      "en",
    );
    expect(summary).toContain("English guide");
    expect(summary).toContain("FR, EN");
    expect(summary).toContain("According to ACLs and the configured workflow");
  });
  it.each(["es", "sk"] as const)(
    "provides a localized confirmation in %s",
    (locale) => {
      expect(publicationSummary(document, locale)).not.toContain(
        "Confirm publication?",
      );
    },
  );
});
