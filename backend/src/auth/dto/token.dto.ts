import { IsEmail, IsJWT } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

export class TokenDto {
  @IsJWT()
  token: string;
}

export class EmailDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsJWT()
  token: string;

  @IsStrongPassword()
  newPassword: string;
}
