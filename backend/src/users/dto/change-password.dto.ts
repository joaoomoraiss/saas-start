import { IsString } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

export class ChangePasswordDto {
  /**
   * Exigida mesmo com o usuario ja autenticado: impede que uma sessao
   * sequestrada troque a senha e tome a conta em definitivo.
   */
  @IsString()
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}
