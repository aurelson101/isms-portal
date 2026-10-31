import { afterEach, expect, it, vi } from "vitest";
import { copyDocumentLink, documentShareUrl } from "./document-share";

afterEach(() => vi.unstubAllGlobals());

it("shares only the canonical document route, without search parameters or fragments", () => {
  expect(
    documentShareUrl(
      "https://portal.example/explorer?search=private#section",
      "security-guide",
    ),
  ).toBe("https://portal.example/documents/security-guide");
});
it("encodes document references rather than interpreting them as URL parameters", () => {
  expect(
    documentShareUrl("https://portal.example", "guide/2026?version=2"),
  ).toBe("https://portal.example/documents/guide%2F2026%3Fversion%3D2");
});
it("confirms copying only after the clipboard operation succeeds", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await expect(
    copyDocumentLink("https://portal.example/documents/guide"),
  ).resolves.toBe(true);
  expect(writeText).toHaveBeenCalledWith(
    "https://portal.example/documents/guide",
  );
});
it("handles denied clipboard permission without rejecting", async () => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
    },
  });
  await expect(
    copyDocumentLink("https://portal.example/documents/guide"),
  ).resolves.toBe(false);
});
it.each([undefined, {}, { clipboard: undefined }])(
  "handles an unavailable clipboard API",
  async (navigator) => {
    vi.stubGlobal("navigator", navigator);
    await expect(
      copyDocumentLink("https://portal.example/documents/guide"),
    ).resolves.toBe(false);
  },
);
it("handles a browser security exception while accessing the clipboard", async () => {
  vi.stubGlobal(
    "navigator",
    Object.defineProperty({}, "clipboard", {
      get() {
        throw new Error("SecurityError");
      },
    }),
  );
  await expect(
    copyDocumentLink("https://portal.example/documents/guide"),
  ).resolves.toBe(false);
});
