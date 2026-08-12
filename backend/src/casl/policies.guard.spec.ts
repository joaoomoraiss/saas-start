import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CastAbilityService } from './cast-ability/cast-ability.service';
import { PoliciesGuard } from './policies.guard';
import { PolicyHandler } from './policies.decorator';

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

describe('PoliciesGuard', () => {
  let reflector: Reflector;
  let guard: PoliciesGuard;
  const abilityService = new CastAbilityService();

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PoliciesGuard(reflector);
  });

  const requirePolicies = (handlers: PolicyHandler[] | undefined) =>
    jest.spyOn(reflector, 'get').mockReturnValue(handlers);

  it('libera handler sem @CheckPolicies', () => {
    requirePolicies(undefined);

    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('libera quando todas as politicas aprovam', () => {
    requirePolicies([() => true, () => true]);
    const ability = abilityService.createForUser({
      id: 'user-1',
      role: 'USER',
    });

    expect(guard.canActivate(contextWith({ ability }))).toBe(true);
  });

  it('bloqueia quando uma unica politica reprova', () => {
    requirePolicies([() => true, () => false]);
    const ability = abilityService.createForUser({
      id: 'user-1',
      role: 'USER',
    });

    expect(() => guard.canActivate(contextWith({ ability }))).toThrow(
      ForbiddenException,
    );
  });

  // Falha fechada: um guard que liberasse por falta de ability transformaria
  // um erro de configuracao em rota aberta.
  it('nega quando o AuthGuard nao rodou antes', () => {
    requirePolicies([() => true]);

    expect(() => guard.canActivate(contextWith({}))).toThrow(
      ForbiddenException,
    );
  });

  it('entrega ability e request para a politica', () => {
    const handler = jest.fn().mockReturnValue(true);
    requirePolicies([handler]);

    const ability = abilityService.createForUser({
      id: 'user-1',
      role: 'USER',
    });
    const request = { ability, params: { id: 'user-1' } };

    guard.canActivate(contextWith(request));

    expect(handler).toHaveBeenCalledWith(ability, request);
  });
});
