import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { VerifiedEmailGuard } from './verified-email.guard';

function contextWith(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('VerifiedEmailGuard', () => {
  const guard = new VerifiedEmailGuard();

  it('libera usuario com e-mail confirmado', () => {
    expect(guard.canActivate(contextWith({ isVerified: true }))).toBe(true);
  });

  it('bloqueia usuario com e-mail pendente', () => {
    expect(() => guard.canActivate(contextWith({ isVerified: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('nega quando o AuthGuard nao rodou antes, em vez de estourar', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
