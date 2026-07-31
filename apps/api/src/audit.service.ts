import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    req: IsmsRequest,
    action: string,
    resource: string,
    result: "success" | "failure" | "denied",
    details?: unknown,
  ) {
    const safeDetails =
      details === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue);
    return this.prisma.auditEvent.create({
      data: {
        identity: req.identity.username,
        ipAddress: req.ip || "unknown",
        action,
        resource,
        result,
        correlationId: req.correlationId,
        ...(safeDetails === undefined ? {} : { details: safeDetails }),
      },
    });
  }
}
