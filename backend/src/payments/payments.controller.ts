import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from 'src/auth/auth.guard';
import { VerifiedEmailGuard } from 'src/auth/verified-email.guard';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { RequiredRoles } from 'src/role/role.decorator';
import { RoleGuard } from 'src/role/role.guard';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentRecordService } from './payment-record.service';
import { PaymentsService } from './payments.service';

/**
 * Camada HTTP: rotas, guards e roteamento evento -> handler. Sem regra de
 * negocio — ela vive no PaymentsService.
 *
 * Nao existe rota de criacao/edicao de Payment de proposito: a tabela e
 * escrita exclusivamente pelo webhook.
 */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentRecordService: PaymentRecordService,
  ) {}

  /**
   * Publico: a Stripe nao tem nosso token. A autenticacao e a assinatura
   * criptografica do payload, verificada antes de qualquer processamento.
   *
   * Declarado ANTES das rotas com :id para nao ser capturado por elas.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // A assinatura e calculada sobre os bytes exatos. Um corpo que passou por
    // parse de JSON e foi re-serializado nao bate — dai o rawBody.
    const payload = request.rawBody;

    if (!payload) {
      throw new BadRequestException('Missing raw body');
    }

    const event = this.paymentsService.constructEvent(payload, signature);
    await this.paymentsService.handleEvent(event);

    // 200 sempre que o evento foi recebido e tratado, inclusive para tipos
    // desconhecidos: um nao-2xx faz a Stripe reentregar para sempre.
    return { received: true };
  }

  @UseGuards(AuthGuard, VerifiedEmailGuard)
  @Post('checkout')
  @HttpCode(200)
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckout(request.user.id, dto.plan);
  }

  @UseGuards(AuthGuard, VerifiedEmailGuard)
  @Post('cancel')
  @HttpCode(200)
  cancel(@Req() request: AuthenticatedRequest) {
    return this.paymentsService.cancelSubscription(request.user.id);
  }

  /**
   * O userId vem do TOKEN, nunca de parametro. A rota que aceita userId como
   * parametro e exclusiva de admin — misturar as duas cria IDOR, com qualquer
   * usuario lendo as faturas de qualquer outro.
   */
  @UseGuards(AuthGuard, VerifiedEmailGuard)
  @Get('user')
  findMine(@Req() request: AuthenticatedRequest) {
    return this.paymentRecordService.findByUser(request.user.id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @RequiredRoles('ADMIN')
  @Get('user/:userId')
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.paymentRecordService.findByUser(userId);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @RequiredRoles('ADMIN')
  @Get()
  findAll() {
    return this.paymentRecordService.findAll();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @RequiredRoles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentRecordService.remove(id);
  }
}
