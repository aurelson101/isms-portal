"use client";

import { useEffect, useState } from "react";

export type PortalBranding = { title: string; logoDataUrl: string | null };
export const defaultBranding: PortalBranding = {
  title: "ISMS Portal",
  logoDataUrl: null,
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
      cachedBranding = branding;
      return branding;
    })
    .catch(() => defaultBranding);
  return brandingRequest;
};

export const updateBrandingCache = (branding: PortalBranding) => {
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
