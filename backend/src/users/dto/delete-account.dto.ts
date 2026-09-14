import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /**
   * Senha atual, exigida mesmo com sessao valida: um access token roubado nao
   * pode bastar para apagar a conta de alguem de forma irreversivel.
   */
  @IsString()
  @MinLength(1)
  password: string;
}
