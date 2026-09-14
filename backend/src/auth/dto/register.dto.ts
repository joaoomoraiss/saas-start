import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RegisterLoginDto } from './registerLogin.dto';

export class RegisterDto extends RegisterLoginDto {
  /**
   * Token do widget Cloudflare Turnstile. Opcional no DTO porque o captcha so
   * e exigido quando TURNSTILE_SECRET_KEY esta configurada — quem decide e o
   * CaptchaService, nao a validacao de formato.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}
