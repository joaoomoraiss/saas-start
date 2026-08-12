import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
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

  @Post('register')
  async register(@Body() registerDto: RegisterLoginDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: RegisterLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(loginDto, res);
  }

  //change the isVerified to true
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('confirm')
  async confirmEmail(@Body() { token }: TokenDto) {
    await this.authService.confirmEmail(token);
  }

  //send verification email
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('verify-email')
  async verifyEmail(@Body() { email }: EmailDto) {
    await this.authService.verifyEmail(email);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  async forgotPassword(@Body() { email }: EmailDto) {
    await this.authService.forgotPassword(email);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() { token, newPassword }: ResetPasswordDto) {
    await this.authService.resetPassword(token, newPassword);
  }

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
  logout(@Res({ passthrough: true }) res: Response) {
    this.authService.logout(res);
  }
}
