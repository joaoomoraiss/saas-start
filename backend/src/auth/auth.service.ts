import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { RegisterLoginDto } from './dto/registerLogin.dto';
import { UserNotFoundException } from './exceptions/user-not-found.exception';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie';
import { TokenService, TokenType } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tokenService: TokenService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async register(registerDto: RegisterLoginDto) {
    const user = await this.usersService.create(registerDto);

    const confirmToken = await this.tokenService.signEmailVerification(user.id);
    await this.mailService.sendUserConfirmation(user.email, confirmToken);

    return { id: user.id, email: user.email };
  }

  async login(loginDto: RegisterLoginDto, res: Response) {
    const user = await this.usersService.findByEmailForAuth(loginDto.email);

    //add provider and if user has password when implement the google login

    // Compara mesmo sem usuario para nao revelar, pelo tempo de resposta,
    // quais e-mails existem na base.
    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      user?.password ??
        '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali',
    );

    if (!user || !isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.requiresVerifiedEmail() && !user.isVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const { token, refreshToken } = await this.tokenService.signAccessPair(
      user.id,
      user.role,
    );

    this.setRefreshCookie(res, refreshToken);

    return { token };
  }

  async confirmEmail(token: string) {
    const payload = await this.tokenService.verify(
      TokenType.EmailVerify,
      token,
    );

    const user = await this.usersService.findOne(payload.id).catch(() => null);

    if (!user) {
      throw new UserNotFoundException();
    }

    await this.usersService.markAsVerified(user.id);
  }

  async verifyEmail(email: string) {
    const user = await this.usersService.findByEmail(email);

    // Resposta identica exista o usuario ou nao: o endpoint nao serve para
    // descobrir quem tem conta.
    if (user && !user.isVerified) {
      const confirmToken = await this.tokenService.signEmailVerification(
        user.id,
      );
      await this.mailService.sendUserConfirmation(user.email, confirmToken);
    }
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (user) {
      const resetToken = await this.tokenService.signPasswordReset(user.id);
      await this.mailService.sendPasswordReset(user.email, resetToken);
    }
  }

  async resetPassword(token: string, newPassword: string) {
    const payload = await this.tokenService.verify(
      TokenType.PasswordReset,
      token,
    );

    const user = await this.usersService.findOne(payload.id).catch(() => null);

    if (!user) {
      throw new UserNotFoundException();
    }

    //add session delete
    await this.usersService.setPassword(user.id, newPassword);
  }

  async refreshToken(req: Request, res: Response) {
    // O express tipa `cookies` como any; o cookie-parser garante apenas que
    // os valores sao strings.
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const currentRefreshToken = cookies[REFRESH_COOKIE];

    if (!currentRefreshToken) {
      throw new InvalidTokenException();
    }

    const payload = await this.tokenService.verify(
      TokenType.Refresh,
      currentRefreshToken,
    );

    const user = await this.usersService.findOne(payload.id).catch(() => null);

    if (!user) {
      throw new InvalidTokenException();
    }

    const { token, refreshToken } = await this.tokenService.signAccessPair(
      user.id,
      user.role,
    );

    this.setRefreshCookie(res, refreshToken);

    return { token };
  }

  logout(res: Response) {
    //session delete
    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(
        this.configService,
        this.tokenService.refreshTtlDays(),
      ),
      maxAge: undefined,
    });
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(
      REFRESH_COOKIE,
      refreshToken,
      refreshCookieOptions(
        this.configService,
        this.tokenService.refreshTtlDays(),
      ),
    );
  }

  private requiresVerifiedEmail(): boolean {
    return (
      this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') === 'true'
    );
  }
}
