import { IsEmail } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

export class RegisterLoginDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;
}
