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
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);
export const isAdminIdentity = (groups: string[]) =>
  groups.includes("ISMS-LOCAL-ADMINS");

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<IsmsRequest>();
    if (!isAdminIdentity(request.identity.groups))
      throw new ForbiddenException();
    return true;
  }
}
