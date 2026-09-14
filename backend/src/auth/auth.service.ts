import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { RevokedReason } from 'generated/prisma/enums';
import {
  CAPTCHA_ACTION_REGISTER,
  CaptchaService,
} from 'src/captcha/captcha.service';
import { isPrismaError } from 'src/common/prisma-error';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterLoginDto } from './dto/registerLogin.dto';
import { UserNotFoundException } from './exceptions/user-not-found.exception';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie';
import { SessionService } from './session.service';
import { TokenService, TokenType } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tokenService: TokenService,
    private sessionService: SessionService,
    private configService: ConfigService,
    private mailService: MailService,
    private captchaService: CaptchaService,
    private prismaService: PrismaService,
  ) {}

  async register(registerDto: RegisterDto, clientIp?: string) {
    const { captchaToken, ...data } = registerDto;

    // A validacao roda aqui, e nao so no Next: um bot que descubra a URL da
    // API contornaria uma checagem feita apenas no frontend.
    const human = await this.captchaService.verify(
      captchaToken,
      clientIp,
      CAPTCHA_ACTION_REGISTER,
    );

    if (!human) {
      throw new BadRequestException('Captcha verification failed');
    }

    const user = await this.usersService.create(data);

    const confirmToken = await this.tokenService.signEmailVerification(user.id);
    await this.mailService.sendUserConfirmation(user.email, confirmToken);

    return { id: user.id, email: user.email };
  }

  async login(loginDto: RegisterLoginDto, res: Response) {
    const user = await this.usersService.findByEmailForAuth(loginDto.email);

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

    const { token, refreshToken } = await this.sessionService.create(user);

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

  /**
   * Link de reset e de USO UNICO: sem isso o JWT continuaria valido pela hora
   * inteira, quantas vezes fosse usado — inclusive depois da troca.
   *
   * Consumir o token e gravar a senha acontecem na mesma transacao. Em dois
   * commits, uma falha no segundo deixaria a senha trocada com o link ainda
   * vivo (ou o link queimado com a senha antiga).
   */
  async resetPassword(token: string, newPassword: string) {
    const payload = await this.tokenService.verify(
      TokenType.PasswordReset,
      token,
    );

    const user = await this.usersService.findOne(payload.id).catch(() => null);

    if (!user) {
      throw new UserNotFoundException();
    }

    const password = await this.usersService.hashPassword(newPassword);

    try {
      await this.prismaService.$transaction([
        this.prismaService.usedToken.create({
          data: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
        }),
        this.prismaService.user.update({
          where: { id: user.id },
          data: { password },
        }),
      ]);
    } catch (err: unknown) {
      // P2002: o jti ja estava na tabela — link reutilizado.
      if (isPrismaError(err, 'P2002')) {
        throw new InvalidTokenException();
      }
      throw err;
    }

    // Quem estava dentro da conta (talvez o motivo do reset) sai junto.
    await this.sessionService.revokeAllForUser(
      user.id,
      RevokedReason.PASSWORD_CHANGE,
    );
  }

  async refreshToken(req: Request, res: Response) {
    const currentRefreshToken = this.readRefreshCookie(req);

    if (!currentRefreshToken) {
      throw new InvalidTokenException();
    }

    const { token, refreshToken } =
      await this.sessionService.rotate(currentRefreshToken);

    this.setRefreshCookie(res, refreshToken);

    return { token };
  }

  /** Revoga a sessao no banco: apagar so o cookie deixaria o token valido. */
  async logout(req: Request, res: Response) {
    const currentRefreshToken = this.readRefreshCookie(req);

    if (currentRefreshToken) {
      await this.sessionService.revoke(currentRefreshToken);
    }

    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(
        this.configService,
        this.tokenService.refreshTtlDays(),
      ),
      maxAge: undefined,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    // O express tipa `cookies` como any; o cookie-parser garante apenas que
    // os valores sao strings.
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[REFRESH_COOKIE];
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
