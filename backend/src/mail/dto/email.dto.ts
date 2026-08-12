import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Buttons } from 'generated/prisma/enums';

export class EmailDto {
  @IsEmail()
  address: string;

  @IsOptional()
  @IsEnum(Buttons)
  button?: Buttons;
}
