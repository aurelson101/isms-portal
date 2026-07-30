import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'crypto';
import type { IsmsRequest } from './types';

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  use(req: IsmsRequest, res: Response, next: NextFunction) {
    req.correlationId = String(req.headers['x-request-id'] || randomUUID());
    res.setHeader('x-request-id', req.correlationId);
    if (req.path === '/health/live' || req.path === '/health/ready' || req.path === '/metrics') {
      req.identity = { username: 'system', displayName: 'System probe', groups: [] };
      return next();
    }
    const demo = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
    if (demo) {
      const groups = (process.env.DEMO_GROUPS || 'Domain Users,ITAD,ISMS-ADMINS').split(',').map((v) => v.trim());
      req.identity = { username: process.env.DEMO_USER || 'demo', displayName: 'Demo User', groups };
      return next();
    }
    const username = req.headers['x-auth-user'];
    const groups = req.headers['x-auth-groups'];
    if (typeof username !== 'string' || typeof groups !== 'string') throw new UnauthorizedException();
    req.identity = {
      username: username.trim(),
      displayName: String(req.headers['x-auth-name'] || username).trim(),
      groups: groups.split(';').map((group) => group.trim()).filter(Boolean),
    };
    next();
  }
}
