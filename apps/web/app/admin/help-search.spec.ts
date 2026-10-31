import { describe, expect, it } from "vitest";
import { filterHelpTopics, normalizeHelpText } from "./help-search";
import { translate } from "../i18n/translate";

describe("help search", () => {
  const topics = [
    {
      id: "sso",
      searchText: normalizeHelpText("Certificat Microsoft : configuration SSO"),
    },
    {
      id: "excel",
      searchText: normalizeHelpText("Excel : critères enregistrés et filtres"),
    },
  ];
  it.each(["SSO certificat", "  sso   CERTIFICAT ", "certificat sso"])(
    "matches unordered search words: %s",
    (query) => {
      expect(filterHelpTopics(topics, query).map((topic) => topic.id)).toEqual([
        "sso",
      ]);
    },
  );
  it("ignores accents without dropping query words", () => {
    expect(
      filterHelpTopics(topics, "criteres filtres").map((topic) => topic.id),
    ).toEqual(["excel"]);
    expect(filterHelpTopics(topics, "excel certificat")).toEqual([]);
  });
  it.each(["", "   "])("returns all topics for an empty search", (query) => {
    expect(filterHelpTopics(topics, query)).toEqual(topics);
  });
  it.each(["es", "sk"] as const)(
    "translates the reader help heading in %s",
    (locale) => {
      expect(
        translate(
          locale,
          "PDF, Excel et fichiers protégés",
          "PDF, Excel and protected files",
        ),
      ).not.toBe("PDF, Excel and protected files");
    },
  );
});
