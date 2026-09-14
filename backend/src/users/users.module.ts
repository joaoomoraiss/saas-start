import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CaslModule } from 'src/casl/casl.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Global()
@Module({
  // PaymentsModule: excluir a conta cancela a assinatura na Stripe antes.
  imports: [PrismaModule, CaslModule, PaymentsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
