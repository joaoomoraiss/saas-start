import { IsIn } from 'class-validator';
import { Plan } from 'generated/prisma/enums';
import { PAID_PLANS } from '../plan.config';

export class CreateCheckoutDto {
  /**
   * So o NOME do plano — nunca Price ID nem valor. O backend resolve o preco
   * a partir da env; aceitar preco do cliente permitiria assinar o plano caro
   * por qualquer valor.
   */
  @IsIn(PAID_PLANS)
  plan: Plan;
}
