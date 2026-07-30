import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './security';

const context = (groups: string[]) => ({
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
  switchToHttp: () => ({ getRequest: () => ({ identity: { groups } }) }),
}) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new AdminGuard(reflector);

  beforeEach(() => jest.clearAllMocks());

  it('allows public handlers', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(guard.canActivate(context([]))).toBe(true);
  });

  it('allows configured administrators after trimming group configuration', () => {
    process.env.ISMS_ADMIN_GROUPS = ' ISMS-ADMINS, ISMS-SUPER-ADMINS ';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(context(['ISMS-ADMINS']))).toBe(true);
  });

  it('denies standard users from admin handlers', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(() => guard.canActivate(context(['Domain Users']))).toThrow(ForbiddenException);
  });
});
