import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { IsStrongPassword } from 'src/common/validators/is-strong-password.decorator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsStrongPassword()
  password: string;
}
