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

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  private readonly providers = [
    new TrustedProxyIdentityProvider(),
    new DemoIdentityProvider(),
  ];

  use(req: IsmsRequest, res: Response, next: NextFunction) {
    const suppliedRequestId = req.headers["x-request-id"];
    req.correlationId =
      typeof suppliedRequestId === "string" &&
      /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    res.setHeader("x-request-id", req.correlationId);
    if (
      req.path === "/health/live" ||
      req.path === "/health/ready" ||
      req.path === "/metrics"
    ) {
      req.identity = {
        username: "system",
        displayName: "System probe",
        groups: [],
        source: "system",
      };
      return next();
    }
    const provider = this.providers.find((candidate) =>
      candidate.supports(req),
    );
    if (!provider) throw new UnauthorizedException();
    req.identity = provider.resolve(req);
    next();
  }
}
