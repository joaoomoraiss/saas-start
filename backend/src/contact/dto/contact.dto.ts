import { IsEmail, IsString, Length } from 'class-validator';

export class ContactDto {
  @IsString()
  @Length(2, 80)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(10, 5000)
  message: string;
}
