import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { clientIp } from 'src/common/client-ip';
import { LIMITS } from 'src/common/throttle/limits';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterLoginDto } from './dto/registerLogin.dto';
import { EmailDto, ResetPasswordDto, TokenDto } from './dto/token.dto';

/**
 * O refresh token so trafega no cookie httpOnly, nunca no corpo da resposta:
 * fora do cookie ele fica ao alcance de qualquer script na pagina.
 * `passthrough: true` mantem a serializacao automatica do Nest ligada.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(LIMITS.register)
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    return this.authService.register(registerDto, clientIp(req));
  }

  @Throttle(LIMITS.login)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: RegisterLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(loginDto, res);
  }

  //change the isVerified to true
  @Throttle(LIMITS.resetPassword)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('confirm')
  async confirmEmail(@Body() { token }: TokenDto) {
    await this.authService.confirmEmail(token);
  }

  //send verification email
  @Throttle(LIMITS.sendEmail)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('verify-email')
  async verifyEmail(@Body() { email }: EmailDto) {
    await this.authService.verifyEmail(email);
  }

  @Throttle(LIMITS.sendEmail)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  async forgotPassword(@Body() { email }: EmailDto) {
    await this.authService.forgotPassword(email);
  }

  @Throttle(LIMITS.resetPassword)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() { token, newPassword }: ResetPasswordDto) {
    await this.authService.resetPassword(token, newPassword);
  }

  @Throttle(LIMITS.refresh)
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refreshToken(req, res);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req, res);
  }
}
