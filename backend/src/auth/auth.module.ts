import { Module } from '@nestjs/common';
import { CaptchaService } from 'src/captcha/captcha.service';
import { MailModule } from 'src/mail/mail.module';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenModule } from './token.module';

@Module({
  imports: [MailModule, UsersModule, TokenModule],
  controllers: [AuthController],
  providers: [AuthService, CaptchaService],
})
export class AuthModule {}
