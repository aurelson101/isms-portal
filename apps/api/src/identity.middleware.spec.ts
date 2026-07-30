import { UnauthorizedException } from '@nestjs/common';
import { IdentityMiddleware } from './identity.middleware';
import type { IsmsRequest } from './types';

const response = () => ({ setHeader: jest.fn() });

describe('IdentityMiddleware', () => {
  const middleware = new IdentityMiddleware();
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      TRUSTED_PROXY_CIDRS: '172.16.0.0/12',
    };
  });

  afterAll(() => { process.env = originalEnv; });

  it('keeps liveness probes public in production', () => {
    const req = { path: '/health/live', headers: {} } as IsmsRequest;
    const next = jest.fn();
    middleware.use(req, response() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.identity.username).toBe('system');
  });

  it('rejects missing production identity', () => {
    const req = { path: '/documents', headers: {} } as IsmsRequest;
    expect(() => middleware.use(req, response() as never, jest.fn())).toThrow(UnauthorizedException);
  });

  it('normalizes trusted proxy identity values', () => {
    const req = { path: '/documents', headers: {
      'x-auth-user': ' alice ',
      'x-auth-name': ' Alice Example ',
      'x-auth-groups': ' Domain Users ; ITAD ;',
    }, socket: { remoteAddress: '172.20.0.5' } } as unknown as IsmsRequest;
    const next = jest.fn();
    middleware.use(req, response() as never, next);
    expect(req.identity).toEqual({
      username: 'alice',
      displayName: 'Alice Example',
      groups: ['Domain Users', 'ITAD'],
    });
  });

  it('rejects identity headers coming from an untrusted address', () => {
    const req = {
      path: '/documents',
      headers: { 'x-auth-user': 'mallory', 'x-auth-groups': 'ISMS-ADMINS' },
      socket: { remoteAddress: '203.0.113.10' },
    } as unknown as IsmsRequest;
    expect(() => middleware.use(req, response() as never, jest.fn())).toThrow(UnauthorizedException);
  });
});
