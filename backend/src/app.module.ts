import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './auth/token.module';
import { CaslModule } from './casl/casl.module';
import { AppThrottlerGuard } from './common/throttle/app-throttler.guard';
import { validateEnv } from './config/env.validation';
import { ContactModule } from './contact/contact.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { MailerModule } from './mailer/mailer.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Os testes apontam ENV_FILE para um arquivo inexistente e injetam a
      // configuracao via process.env, para que um .env local jamais vaze
      // para dentro da suite (em especial o DATABASE_URL de desenvolvimento).
      envFilePath: process.env.ENV_FILE ?? '.env',
      validate: validateEnv,
    }),
    // Limite global por IP; as rotas sensiveis apertam com @Throttle
    // (ver src/common/throttle/limits.ts).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    // Jobs agendados (hoje: limpeza de sessoes expiradas).
    ScheduleModule.forRoot(),
    PrismaModule,
    CaslModule,
    TokenModule,
    UsersModule,
    AuthModule,
    MailerModule,
    MailModule,
    PaymentsModule,
    ContactModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
