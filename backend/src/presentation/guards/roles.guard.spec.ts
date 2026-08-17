import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../domain/entities/user.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const makeContext = (method: string, user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn(() => undefined) } as unknown as
      Reflector;
    guard = new RolesGuard(reflector);
  });

  it('should reject when no user is present', () => {
    expect(() => guard.canActivate(makeContext('GET', undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('should allow VIEWER on GET without roles', () => {
    expect(guard.canActivate(makeContext('GET', { role: 'VIEWER' }))).toBe(
      true,
    );
  });

  it('should block VIEWER on POST even without roles', () => {
    expect(() =>
      guard.canActivate(makeContext('POST', { role: 'VIEWER' })),
    ).toThrow('VIEWER role is read-only');
  });

  it('should block VIEWER on PATCH and DELETE', () => {
    expect(() =>
      guard.canActivate(makeContext('PATCH', { role: 'VIEWER' })),
    ).toThrow('VIEWER role is read-only');
    expect(() =>
      guard.canActivate(makeContext('DELETE', { role: 'VIEWER' })),
    ).toThrow('VIEWER role is read-only');
  });

  it('should allow ADMIN and USER on write methods without roles', () => {
    expect(guard.canActivate(makeContext('POST', { role: 'ADMIN' }))).toBe(
      true,
    );
    expect(guard.canActivate(makeContext('POST', { role: 'USER' }))).toBe(true);
  });

  it('should enforce @Roles lists (VIEWER not whitelisted)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
      UserRole.USER,
    ]);
    expect(() =>
      guard.canActivate(makeContext('GET', { role: 'VIEWER' })),
    ).toThrow('Insufficient permissions');
    expect(
      guard.canActivate(makeContext('GET', { role: 'USER' })),
    ).toBe(true);
    expect(guard.canActivate(makeContext('GET', { role: 'ADMIN' }))).toBe(true);
  });
});