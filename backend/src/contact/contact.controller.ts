import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ServiceTokenGuard } from 'src/common/service-token.guard';
import { LIMITS } from 'src/common/throttle/limits';
import { MailService } from 'src/mail/mail.service';
import { ContactDto } from './dto/contact.dto';

/**
 * Formulario de contato do site.
 *
 * O formulario e publico, o endpoint nao: o browser fala com /api/contact no
 * Next, que repassa com o SERVICE_TOKEN. Chamado direto, isto seria um relay
 * aberto de e-mail. O limite e por IP do visitante (X-Client-IP, confiavel
 * justamente por vir com o token de servico).
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly mailService: MailService) {}

  @UseGuards(ServiceTokenGuard)
  @Throttle(LIMITS.contact)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post()
  async send(@Body() dto: ContactDto) {
    await this.mailService.sendContactMessage(dto);
    return { sent: true };
  }
}
