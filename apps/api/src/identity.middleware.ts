import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import type { NextFunction, Response } from "express";
import { randomUUID } from "crypto";
import type { IsmsRequest } from "./types";
import {
  DemoIdentityProvider,
  TrustedProxyIdentityProvider,
} from "./identity.provider";
import { AuthService } from "./auth.service";

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  private readonly providers = [
    new TrustedProxyIdentityProvider(),
    new DemoIdentityProvider(),
  ];

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
      route === "/metrics"
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
    const provider = this.providers.find((candidate) =>
      candidate.supports(req),
    );
    if (provider) {
      const identity = provider.resolve(req);
      req.identity =
        identity.source === "trusted-proxy"
          ? await this.auth.enrichSsoIdentity(identity)
          : identity;
      return next();
    }
    const sessionIdentity = await this.auth.sessionIdentity(req);
    if (sessionIdentity) {
      req.identity = sessionIdentity;
      return next();
    }
    if (route === "/auth/login" || route === "/auth/config") {
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
