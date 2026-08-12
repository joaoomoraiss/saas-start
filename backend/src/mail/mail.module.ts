import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailController } from './mail.controller';
import { MailerModule } from 'src/mailer/mailer.module';

@Global()
@Module({
  imports: [PrismaModule, MailerModule],
  providers: [MailService],
  controllers: [MailController],
  exports: [MailService],
})
export class MailModule {}
