import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IsmsRequest } from "./types";

const ADMIN_KEY = "admin";
const APPROVER_KEY = "approver";
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);
export const ApproverOnly = () => SetMetadata(APPROVER_KEY, true);
export const isAdminIdentity = (groups: string[]) =>
  groups.includes("ISMS-LOCAL-ADMINS");
export const isModeratorIdentity = (groups: string[]) =>
  groups.includes("ISMS-MODERATOR-MANAGE");
export const moderatorCan = (groups: string[], permission: string) => {
  if (isAdminIdentity(groups)) return true;
  if (!isModeratorIdentity(groups)) return false;
  if (permission === "publish") return groups.includes("ISMS-MODERATOR-PUBLISH");
  if (permission === "archive") return groups.includes("ISMS-MODERATOR-ARCHIVE");
  return true;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<IsmsRequest>();
    if (required && !isAdminIdentity(request.identity.groups))
      throw new ForbiddenException();
    const approverRequired = this.reflector.getAllAndOverride<boolean>(
      APPROVER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      approverRequired &&
      !isAdminIdentity(request.identity.groups) &&
      !isModeratorIdentity(request.identity.groups)
    )
      throw new ForbiddenException();
    return true;
  }
}
