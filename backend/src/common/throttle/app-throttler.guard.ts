import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from '../client-ip';

/**
 * Rate limit global, contado por IP do cliente original (ver clientIp).
 *
 * O storage padrao e em memoria: nao sobrevive a restart e nao e
 * compartilhado entre instancias. Com N replicas o limite efetivo e N vezes o
 * configurado — para escalar horizontalmente, troque por um storage Redis.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(clientIp(req as Request));
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Existe para a suite e2e, que faz dezenas de logins por arquivo. Nao
    // desligue em producao.
    if (process.env.RATE_LIMIT_ENABLED === 'false') return true;

    return super.shouldSkip(context);
  }
}
