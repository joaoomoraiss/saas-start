import { IsOptional, IsString, Length } from 'class-validator';

/** Campos que o proprio usuario pode editar no seu perfil. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;
}
