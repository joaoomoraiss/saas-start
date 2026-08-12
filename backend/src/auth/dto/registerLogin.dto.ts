import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

export class RegisterLoginDto {
  @IsEmail()
  email: string;

  /**
   * Opcional para nao quebrar o login, que compartilha este DTO. O
   * ValidationPipe roda com forbidNonWhitelisted: sem declarar o campo aqui,
   * um register com `name` seria rejeitado com 400.
   */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsStrongPassword()
  password: string;
}
