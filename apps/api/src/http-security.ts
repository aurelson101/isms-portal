import type { NextFunction, Request, Response } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const sameOriginMutationGuard = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (safeMethods.has(request.method.toUpperCase())) return next();

  const fetchSite = request.get("sec-fetch-site");
  if (fetchSite === "cross-site")
    return response
      .status(403)
      .json({ message: "Cross-site request rejected" });

  const origin = request.get("origin");
  if (!origin) return next();
  try {
    const parsed = new URL(origin);
    // TLS terminates at the proxy, so use the configured external origin.
    const publicUrl = process.env.PUBLIC_URL;
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      origin === parsed.origin &&
      parsed.host === request.get("host") &&
      (!publicUrl || parsed.origin === new URL(publicUrl).origin)
    )
      return next();
  } catch {
    // A malformed Origin is never a valid same-origin browser request.
  }
  return response.status(403).json({ message: "Origin rejected" });
};

export const safeSsoPath = (value: string | undefined) => {
  if (!value) return null;
  try {
    const parsed = new URL(value, "http://isms.invalid");
    return parsed.origin === "http://isms.invalid" &&
      parsed.pathname.startsWith("/oauth2/") &&
      !value.startsWith("//")
      ? `${parsed.pathname}${parsed.search}`
      : null;
  } catch {
    return null;
  }
};
