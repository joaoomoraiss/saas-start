import { Module } from '@nestjs/common';
import { CastAbilityService } from './cast-ability/cast-ability.service';
import { PoliciesGuard } from './policies.guard';

@Module({
  providers: [CastAbilityService, PoliciesGuard],
  exports: [CastAbilityService, PoliciesGuard],
})
export class CaslModule {}
