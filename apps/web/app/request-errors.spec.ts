import { afterEach, describe, expect, it, vi } from "vitest";
import { responseMessage } from "./request-errors";
import { prepareBrandLogo, updateBrandingCache } from "./branding";

afterEach(() => vi.unstubAllGlobals());

describe("safe errors and branding", () => {
  it("explains stale edits without exposing backend details", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "en" });
    expect(await responseMessage(Response.json({ code: "DOCUMENT_CHANGED", message: "internal" }, { status: 409 }), "Fallback")).toContain("Your fields are preserved");
  });
  it.each([401, 403, 413, 503])("provides a meaningful fallback for HTTP %s", async status => {
    vi.stubGlobal("localStorage", { getItem: () => "en" });
    expect(await responseMessage(new Response("<html>Error</html>", { status }), "Fallback")).not.toBe("Fallback");
  });
  it("handles string, array, invalid and non-JSON error bodies", async () => {
    expect(await responseMessage(Response.json({ message: "Denied" }), "Fallback")).toBe("Denied");
    expect(await responseMessage(Response.json({ message: ["First", 123, "Second"] }), "Fallback")).toBe("First. Second");
    expect(await responseMessage(Response.json({ message: { secret: "hidden" } }), "Fallback")).toBe("Fallback");
    expect(await responseMessage(new Response("<html>Error</html>"), "Fallback")).toBe("Fallback");
  });
  it("normalizes incomplete branding and rejects executable logo URLs", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("document", { title: "" });
    let branding: unknown;
    target.addEventListener("isms-branding", (event) => { branding = (event as CustomEvent).detail; });
    updateBrandingCache({ title: " ", logoDataUrl: "javascript:alert(1)" });
    expect(branding).toEqual({ title: "ISMS Portal", logoDataUrl: null });
    expect(document.title).toBe("ISMS Portal");
  });
  it("rejects unsupported and oversized logo sources before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareBrandLogo(new File(["x"], "logo.svg", { type: "image/svg+xml" }))).rejects.toThrow("Unsupported logo format");
    await expect(prepareBrandLogo({ type: "image/png", size: 21 * 1024 * 1024 } as File)).rejects.toThrow("Logo source is too large");
    expect(decode).not.toHaveBeenCalled();
  });
  it("releases the decoded bitmap when canvas processing fails", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 16, height: 16, close }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    await expect(prepareBrandLogo(new File(["x"], "logo.png", { type: "image/png" }))).rejects.toThrow("Logo processing failed");
    expect(close).toHaveBeenCalledOnce();
  });
  it("resizes a valid bitmap and releases it after WebP conversion", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["webp"], { type: "image/webp" })) };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1024, height: 512, close }));
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("FileReader", class {
      result = "data:image/webp;base64,d2VicA==";
      onload: (() => void) | null = null;
      readAsDataURL() { this.onload?.(); }
    });
    expect(await prepareBrandLogo(new File(["png"], "logo.png", { type: "image/png" }))).toBe("data:image/webp;base64,d2VicA==");
    expect([canvas.width, canvas.height]).toEqual([512, 256]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
