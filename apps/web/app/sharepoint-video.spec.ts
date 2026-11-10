import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExternalDocumentLink } from "./external-document-link";
import { sharePointVideoEmbedUrl } from "./sharepoint-video";

const guid = "12345678-1234-4123-8123-123456789abc";
const shared =
  "https://training.sharepoint.com/:v:/r/sites/Academy/Shared%20Documents/Training.mp4?d=w12345678123441238123123456789abc&web=1&e=sharing-code";

describe("SharePoint video documents", () => {
  it("converts a shared video to its site player without forwarding sharing tokens", () => {
    const player = new URL(sharePointVideoEmbedUrl(shared)!);
    expect(player.origin).toBe("https://training.sharepoint.com");
    expect(player.pathname).toBe("/sites/Academy/_layouts/15/embed.aspx");
    expect([...player.searchParams]).toEqual([["UniqueId", guid]]);
  });

  it.each(["/teams/Training", "", "/sites/Training%20Site"])(
    "preserves the site location %s",
    (site) => {
      const link = shared.replace("/sites/Academy", site);
      expect(new URL(sharePointVideoEmbedUrl(link)!).pathname).toBe(
        `${site}/_layouts/15/embed.aspx`,
      );
    },
  );

  it("accepts an official embed URL, including a nested web", () => {
    expect(
      sharePointVideoEmbedUrl(
        `https://training.sharepoint.com/sites/Academy/Subsite/_layouts/15/embed.aspx?UniqueId=%7B${guid}%7D&autoplay=true`,
      ),
    ).toBe(
      `https://training.sharepoint.com/sites/Academy/Subsite/_layouts/15/embed.aspx?UniqueId=${guid}`,
    );
  });

  it.each([
    "https://training.sharepoint.com.evil.example/video.mp4",
    "https://evilsharepoint.com/video.mp4",
    shared.replace("https:", "http:"),
    shared.replace(
      "training.sharepoint.com",
      "user:password@training.sharepoint.com",
    ),
    shared.replace("training.sharepoint.com", "training.sharepoint.com:8443"),
    shared.replace("Training.mp4", "Document.docx").replace("/:v:/r", ""),
    shared.replace("w12345678123441238123123456789abc", "invalid"),
    shared.replace(/\?.*$/, ""),
    "javascript:alert(1)",
    "not a URL",
  ])("does not embed unsupported or unsafe URLs: %s", (url) => {
    expect(sharePointVideoEmbedUrl(url)).toBeNull();
  });

  it("renders the responsive player and keeps the original external link", () => {
    const markup = renderToStaticMarkup(
      createElement(ExternalDocumentLink, {
        url: shared,
        title: "Training video",
        locale: "fr",
      }),
    );
    expect(markup).toContain('class="sharepoint-video-player"');
    expect(markup).toContain('title="Training video"');
    expect(markup).toContain('sandbox="allow-scripts allow-same-origin');
    expect(markup).toContain("Ouvrir dans SharePoint");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain(shared.replaceAll("&", "&amp;"));
  });

  it.each(["en", "fr", "es", "sk"] as const)(
    "provides a Microsoft access explanation in %s",
    (locale) => {
      const markup = renderToStaticMarkup(
        createElement(ExternalDocumentLink, {
          url: shared,
          title: "Video",
          locale,
        }),
      );
      expect(markup).toContain("Microsoft");
      expect(markup).toContain("SharePoint");
    },
  );

  it("keeps ordinary links external and rejects executable URL schemes", () => {
    const markup = renderToStaticMarkup(
      createElement(ExternalDocumentLink, {
        url: "https://example.com/manual",
        title: "Manual",
        locale: "en",
      }),
    );
    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("Open external link");
    expect(
      renderToStaticMarkup(
        createElement(ExternalDocumentLink, {
          url: "javascript:alert(1)",
          title: "Invalid",
          locale: "en",
        }),
      ),
    ).toBe("");
  });
});
