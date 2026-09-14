import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role } from 'generated/prisma/enums';
import { InvalidTokenException } from './exceptions/token-not-found.exception';

export enum TokenType {
  Access = 'access',
  Refresh = 'refresh',
  EmailVerify = 'email_verify',
  PasswordReset = 'password_reset',
}

export interface TokenPayload {
  id: string;
  role?: Role;
  typ: TokenType;
  /**
   * Sessao (linha de RefreshToken) que emitiu este access token. E o que
   * permite, por exemplo, trocar a senha derrubando todas as OUTRAS sessoes
   * sem deslogar quem fez a troca.
   */
  sid?: string;
  /** Id unico do token: base do uso unico e do hash sem colisao. */
  jti: string;
  /** Expiracao em segundos (epoch). */
  exp: number;
}

type SignablePayload = Pick<TokenPayload, 'id' | 'role' | 'sid'>;

const SECRET_ENV: Record<TokenType, string> = {
  [TokenType.Access]: 'JWT_SECRET',
  [TokenType.Refresh]: 'JWT_REFRESH_SECRET',
  [TokenType.EmailVerify]: 'JWT_VERIFY_SECRET',
  [TokenType.PasswordReset]: 'JWT_FORGOT_SECRET',
};

/**
 * Ponto unico de emissao e verificacao de JWT.
 *
 * Cada tipo de token tem secret proprio E um claim `typ` conferido na
 * verificacao. Sao duas barreiras de proposito: sem elas, um token emitido
 * para confirmar e-mail (que trafega em texto plano dentro de uma URL)
 * autentica na API como se fosse um token de acesso.
 *
 * Este servico so assina e confere assinatura. Se um refresh token ainda vale
 * (revogado, rotacionado, reusado) quem decide e o SessionService, no banco.
 */
@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private secretFor(type: TokenType): string {
    // A ausencia ja e barrada por validateEnv() no boot.
    return this.configService.get<string>(SECRET_ENV[type])!;
  }

  private expiresInFor(type: TokenType): JwtSignOptions['expiresIn'] {
    // O cast cobre a distancia entre o template literal type do jsonwebtoken
    // ('15m', '7d', ...) e a string solta que vem do ambiente.
    switch (type) {
      case TokenType.Access:
        return (this.configService.get<string>('ACCESS_TOKEN_TTL') ??
          '15m') as JwtSignOptions['expiresIn'];
      case TokenType.Refresh:
        return `${this.refreshTtlDays()}d` as JwtSignOptions['expiresIn'];
      case TokenType.EmailVerify:
        return '1d';
      case TokenType.PasswordReset:
        return '1h';
    }
  }

  refreshTtlDays(): number {
    return Number(
      this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 30,
    );
  }

  private sign(type: TokenType, payload: SignablePayload) {
    return this.jwtService.signAsync(
      { ...payload, typ: type },
      {
        secret: this.secretFor(type),
        expiresIn: this.expiresInFor(type),
        algorithm: 'HS256',
        // Sem jti, dois tokens do mesmo usuario emitidos no mesmo segundo
        // saem identicos — e o hash do refresh token colidiria no banco.
        jwtid: randomUUID(),
      },
    );
  }

  /**
   * Verifica assinatura, algoritmo e proposito do token.
   * Lanca InvalidTokenException para qualquer falha, sem distinguir a causa
   * (expirado, adulterado, proposito errado) para quem chama de fora.
   */
  async verify(type: TokenType, token: string): Promise<TokenPayload> {
    let payload: TokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.secretFor(type),
        algorithms: ['HS256'],
      });
    } catch {
      throw new InvalidTokenException();
    }

    if (payload.typ !== type || !payload.jti) {
      throw new InvalidTokenException();
    }

    return payload;
  }

  signAccess(id: string, role: Role, sessionId: string) {
    return this.sign(TokenType.Access, { id, role, sid: sessionId });
  }

  signRefresh(id: string) {
    return this.sign(TokenType.Refresh, { id });
  }

  signEmailVerification(id: string) {
    return this.sign(TokenType.EmailVerify, { id });
  }

  signPasswordReset(id: string) {
    return this.sign(TokenType.PasswordReset, { id });
  }
}
