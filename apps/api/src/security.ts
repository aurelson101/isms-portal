import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IsmsRequest } from './types';

export const ADMIN_KEY = 'admin';
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<IsmsRequest>();
    const adminGroups = (process.env.ISMS_ADMIN_GROUPS || 'ISMS-ADMINS,ISMS-SUPER-ADMINS')
      .split(',').map((group) => group.trim()).filter(Boolean);
    if (!request.identity.groups.some((group) => adminGroups.includes(group))) throw new ForbiddenException();
    return true;
  }
}
