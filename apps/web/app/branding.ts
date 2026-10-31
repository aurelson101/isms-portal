"use client";

import { useEffect, useState } from "react";
import {
  normalizeLanguageSettings,
  type LanguageSettings,
} from "./i18n/locale";

export type PortalBranding = {
  title: string;
  logoDataUrl: string | null;
  languages?: LanguageSettings;
};
export const defaultBranding: PortalBranding = {
  title: "ISMS Portal",
  logoDataUrl: null,
};

const MAX_LOGO_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_LOGO_OUTPUT_BYTES = 170 * 1024;
const MAX_LOGO_DIMENSION = 512;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const normalizeBranding = (
  value: Partial<PortalBranding> | null,
): PortalBranding => ({
  title:
    typeof value?.title === "string" && value.title.trim()
      ? value.title.trim()
      : defaultBranding.title,
  logoDataUrl:
    typeof value?.logoDataUrl === "string" &&
    /^data:image\/(png|jpeg|webp);base64,/i.test(value.logoDataUrl)
      ? value.logoDataUrl
      : null,
  languages: normalizeLanguageSettings(value?.languages),
});

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );

const blobDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Logo processing failed"));
    reader.readAsDataURL(blob);
  });

export const prepareBrandLogo = async (file: File) => {
  if (!LOGO_TYPES.has(file.type)) throw new Error("Unsupported logo format");
  if (file.size > MAX_LOGO_SOURCE_BYTES)
    throw new Error("Logo source is too large");

  const image = await createImageBitmap(file).catch(() => {
    throw new Error("Logo image is invalid");
  });
  try {
    if (!image.width || !image.height) throw new Error("Logo image is invalid");

    const scale = Math.min(
      1,
      MAX_LOGO_DIMENSION / Math.max(image.width, image.height),
    );
    let width = Math.max(1, Math.round(image.width * scale));
    let height = Math.max(1, Math.round(image.height * scale));
    let result: Blob | null = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Logo processing failed");
      context.drawImage(image, 0, 0, width, height);
      result = await canvasBlob(canvas, Math.max(0.45, 0.88 - attempt * 0.06));
      if (result && result.size <= MAX_LOGO_OUTPUT_BYTES) break;
      width = Math.max(64, Math.round(width * 0.85));
      height = Math.max(64, Math.round(height * 0.85));
    }
    if (!result || result.size > MAX_LOGO_OUTPUT_BYTES)
      throw new Error("Logo processing failed");
    return blobDataUrl(result);
  } finally {
    image.close();
  }
};

let cachedBranding: PortalBranding | null = null;
let brandingRequest: Promise<PortalBranding> | null = null;

const loadBranding = () => {
  if (cachedBranding) return Promise.resolve(cachedBranding);
  brandingRequest ||= fetch("/api/branding", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Branding unavailable");
      return response.json() as Promise<PortalBranding>;
    })
    .then((branding) => {
      cachedBranding = normalizeBranding(branding);
      return cachedBranding;
    })
    .catch(() => {
      brandingRequest = null;
      return defaultBranding;
    });
  return brandingRequest;
};

export const updateBrandingCache = (branding: PortalBranding) => {
  branding = normalizeBranding({ ...cachedBranding, ...branding });
  cachedBranding = branding;
  brandingRequest = Promise.resolve(branding);
  document.title = branding.title;
  window.dispatchEvent(new CustomEvent("isms-branding", { detail: branding }));
};

export const useBranding = () => {
  const [branding, setBranding] = useState(cachedBranding || defaultBranding);
  useEffect(() => {
    let active = true;
    const update = (event: Event) =>
      setBranding((event as CustomEvent<PortalBranding>).detail);
    window.addEventListener("isms-branding", update);
    void loadBranding().then((value) => {
      if (!active) return;
      setBranding(value);
      document.title = value.title;
    });
    return () => {
      active = false;
      window.removeEventListener("isms-branding", update);
    };
  }, []);
  return branding;
};
