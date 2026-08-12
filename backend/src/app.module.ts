import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './auth/token.module';
import { CaslModule } from './casl/casl.module';
import { validateEnv } from './config/env.validation';
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
    PrismaModule,
    CaslModule,
    TokenModule,
    UsersModule,
    AuthModule,
    MailerModule,
    MailModule,
    PaymentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
