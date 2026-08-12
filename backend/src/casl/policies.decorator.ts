import { SetMetadata } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { AppAbility } from './cast-ability/cast-ability.service';

export const CHECK_POLICIES_KEY = 'check_policies';

export type PolicyHandler = (
  ability: AppAbility,
  request: AuthenticatedRequest,
) => boolean;

/**
 * Declara a regra CASL que o handler exige. Avaliada pelo PoliciesGuard.
 *
 * @example
 * @CheckPolicies((ability, req) => ability.can('update', userSubject(req.params.id)))
 */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
