import { EmailDto } from './dto/email.dto';
import { MailService } from 'src/mail/mail.service';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

@Controller('mail')
export class MailController {
  constructor(private mailService: MailService) {}

  @HttpCode(204)
  @Post()
  async saveEmail(@Body() emailDto: EmailDto) {
    await this.mailService.saveEmail(emailDto);
  }
}
