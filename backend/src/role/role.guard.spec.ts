import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleGuard } from './role.guard';

function contextWith(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  let reflector: Reflector;
  let guard: RoleGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RoleGuard(reflector);
  });

  const requireRoles = (roles: unknown) =>
    jest.spyOn(reflector, 'get').mockReturnValue(roles);

  it('libera handler sem @RequiredRoles', () => {
    requireRoles(undefined);

    expect(guard.canActivate(contextWith({ role: 'USER' }))).toBe(true);
  });

  it('libera quando o papel exigido bate', () => {
    requireRoles(['ADMIN']);

    expect(guard.canActivate(contextWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('ADMIN atende qualquer exigencia de papel', () => {
    requireRoles(['SUPPORT']);

    expect(guard.canActivate(contextWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('bloqueia papel insuficiente', () => {
    requireRoles(['ADMIN']);

    expect(() => guard.canActivate(contextWith({ role: 'USER' }))).toThrow(
      ForbiddenException,
    );
  });

  // Antes, `authUser!.role` estourava um TypeError e virava 500 — uma falha
  // de autorizacao disfarcada de erro interno.
  it('nega com 401 quando nao ha usuario na request', () => {
    requireRoles(['ADMIN']);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('libera quando a lista de papeis exigidos esta vazia', () => {
    requireRoles([]);

    expect(guard.canActivate(contextWith({ role: 'USER' }))).toBe(true);
  });
});
