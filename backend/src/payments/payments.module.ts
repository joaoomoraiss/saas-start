import { Module } from '@nestjs/common';
import { CaslModule } from 'src/casl/casl.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentRecordService } from './payment-record.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { stripeProvider } from './stripe.provider';

@Module({
  // CaslModule nao e global: sem ele o AuthGuard nao resolve o
  // CastAbilityService no contexto deste modulo.
  imports: [PrismaModule, CaslModule],
  controllers: [PaymentsController],
  providers: [stripeProvider, PaymentsService, PaymentRecordService],
  exports: [PaymentsService, PaymentRecordService],
})
export class PaymentsModule {}
