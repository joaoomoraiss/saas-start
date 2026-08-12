import { IsOptional } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

/**
 * `isVerified` e `role` estao ausentes de proposito: sao estado de seguranca,
 * alterado apenas por fluxos dedicados (confirmacao de e-mail, promocao de
 * papel), nunca por um PATCH vindo do cliente.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsStrongPassword()
  password?: string;
}
