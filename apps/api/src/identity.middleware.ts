import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import type { NextFunction, Response } from "express";
import { randomUUID } from "crypto";
import type { IsmsRequest } from "./types";
import { TrustedProxyIdentityProvider } from "./identity.provider";
import { AuthService } from "./auth.service";

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  private readonly providers = [new TrustedProxyIdentityProvider()];

  async use(req: IsmsRequest, res: Response, next: NextFunction) {
    const route = req.originalUrl.split("?")[0];
    const suppliedRequestId = req.headers["x-request-id"];
    req.correlationId =
      typeof suppliedRequestId === "string" &&
      /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    res.setHeader("x-request-id", req.correlationId);
    if (
      route === "/health/live" ||
      route === "/health/ready" ||
      route === "/metrics" ||
      (route === "/branding" && req.method === "GET")
    ) {
      req.identity = {
        username: "system",
        displayName: "System probe",
        groups: [],
        source: "system",
        sessionExpiresAt: null,
      };
      return next();
    }
    if (route === "/admin" || route.startsWith("/admin/")) {
      const adminIdentity = await this.auth.adminSessionIdentity(req);
      if (adminIdentity) {
        req.identity = adminIdentity;
        return next();
      }
    }
    const provider = this.providers.find((candidate) =>
      candidate.supports(req),
    );
    const refreshDirectoryGroups =
      route === "/me" && req.query?.refresh === "1";
    if (provider) {
      const identity = provider.resolve(req);
      req.identity =
        identity.source === "trusted-proxy"
          ? await this.auth.enrichSsoIdentity(identity, refreshDirectoryGroups)
          : identity;
      return next();
    }
    const sessionIdentity = await this.auth.sessionIdentity(
      req,
      refreshDirectoryGroups,
    );
    if (sessionIdentity) {
      req.identity = sessionIdentity;
      return next();
    }
    if (
      route === "/auth/login" ||
      route === "/auth/directory-login" ||
      route === "/auth/config"
    ) {
      req.identity = {
        username: "anonymous",
        displayName: "Anonymous",
        groups: [],
        source: "anonymous",
        sessionExpiresAt: null,
      };
      return next();
    }
    throw new UnauthorizedException();
  }
}
