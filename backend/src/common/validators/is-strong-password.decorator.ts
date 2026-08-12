import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Regra de senha do projeto, declarada em um lugar so.
 *
 * O teto de 72 e o limite do bcrypt, que ignora bytes alem disso. Nao ha
 * limite menor de proposito: um maximo curto quebra gerenciadores de senha
 * e passphrases, que sao justamente os casos mais seguros.
 */
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'Password must be at least 8 characters long' }),
    MaxLength(72, { message: 'Password must be at most 72 characters long' }),
    Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/, {
      message:
        'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
    }),
  );
}
