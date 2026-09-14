import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { RevokedReason, Role } from 'generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { TokenService, TokenType } from './token.service';

/**
 * Janela em que um refresh token recem-rotacionado ainda e aceito.
 *
 * Sem ela, eventos rotineiros viram "roubo de token": a resposta da rotacao
 * se perde na rede e o cliente repete com o token antigo, ou o proxy do Next
 * e uma rota /api renovam ao mesmo tempo com o mesmo cookie. Nos dois casos
 * o segundo pedido chega com um token acabado de revogar, e a deteccao de
 * reuso derrubaria todas as sessoes do usuario. RFC 6819 e o OAuth 2.0
 * Security BCP recomendam exatamente esta tolerancia.
 */
export const ROTATION_GRACE_MS = 30_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionTokens {
  /** Access token (curto, vai no header Authorization). */
  token: string;
  /** Refresh token (longo, so trafega em cookie httpOnly). */
  refreshToken: string;
}

interface SessionUser {
  id: string;
  role: Role;
}

/**
 * Sessoes persistidas: cada refresh token emitido vira uma linha no banco,
 * guardada por hash. E o que torna possivel logout de verdade, derrubar
 * sessoes na troca de senha e detectar reuso de token roubado — nada disso
 * existe com JWT puramente stateless.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * SHA-256 sem salt e o correto aqui: o refresh token e um JWT de alta
   * entropia, sem ataque de dicionario a defender, e a busca precisa ser
   * deterministica para o indice unique funcionar.
   */
  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(user: SessionUser): Promise<SessionTokens> {
    const refreshToken = await this.tokenService.signRefresh(user.id);

    const session = await this.prismaService.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: SessionService.hash(refreshToken),
        expiresAt: new Date(
          Date.now() + this.tokenService.refreshTtlDays() * DAY_MS,
        ),
      },
    });

    const token = await this.tokenService.signAccess(
      user.id,
      user.role,
      session.id,
    );

    return { token, refreshToken };
  }

  /**
   * Troca um refresh token valido por um par novo, revogando o antigo.
   *
   * Um token ja rotacionado fora da janela de graca e tratado como roubo:
   * quem o apresenta nao e o dono legitimo (que ja tem o sucessor), entao
   * todas as sessoes do usuario caem. Tokens revogados por logout ou troca de
   * senha so recebem 401 — sao eventos benignos, e disparar a deteccao ali
   * encheria o log de alarmes falsos e esconderia um roubo real.
   */
  async rotate(refreshToken: string): Promise<SessionTokens> {
    // Assinatura primeiro: um token forjado nao chega a consultar o banco.
    const payload = await this.tokenService.verify(
      TokenType.Refresh,
      refreshToken,
    );

    const session = await this.prismaService.refreshToken.findUnique({
      where: { tokenHash: SessionService.hash(refreshToken) },
      include: { user: true },
    });

    if (!session || session.userId !== payload.id) {
      throw new InvalidTokenException();
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new InvalidTokenException();
    }

    if (session.revokedAt) {
      const rotated = session.revokedReason === RevokedReason.ROTATED;
      const withinGrace =
        rotated &&
        Date.now() - session.revokedAt.getTime() <= ROTATION_GRACE_MS &&
        !(await this.endedSince(session.userId, session.revokedAt));

      if (!withinGrace) {
        if (rotated) {
          await this.revokeAllForUser(session.userId, RevokedReason.REUSE);
          this.logger.warn(
            `Reuso de refresh token detectado para o usuario ${session.userId}: todas as sessoes revogadas`,
          );
        }
        throw new InvalidTokenException();
      }
    } else {
      // updateMany com `revokedAt: null` no filtro: se outra requisicao
      // rotacionou no mesmo instante, esta nao sobrescreve o registro dela.
      await this.prismaService.refreshToken.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: RevokedReason.ROTATED },
      });
    }

    // Papel lido do banco agora, nao do token antigo: rebaixar um ADMIN tem
    // efeito na proxima renovacao.
    return this.create(session.user);
  }

  /**
   * A janela de graca existe para requisicoes concorrentes da MESMA sessao.
   * Se, depois da rotacao, a pessoa saiu (logout), trocou a senha ou teve
   * reuso detectado, o token antigo nao pode ressuscitar a sessao — senao um
   * logout feito ate 30 s depois de uma renovacao nao valeria.
   */
  private async endedSince(userId: string, since: Date): Promise<boolean> {
    const count = await this.prismaService.refreshToken.count({
      where: {
        userId,
        revokedAt: { gte: since },
        revokedReason: {
          in: [
            RevokedReason.LOGOUT,
            RevokedReason.PASSWORD_CHANGE,
            RevokedReason.REUSE,
          ],
        },
      },
    });

    return count > 0;
  }

  /** Logout. Idempotente: token desconhecido ou ja revogado nao e erro. */
  async revoke(refreshToken: string): Promise<void> {
    await this.prismaService.refreshToken.updateMany({
      where: { tokenHash: SessionService.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RevokedReason.LOGOUT },
    });
  }

  /**
   * Derruba as sessoes ativas do usuario. `exceptSessionId` preserva a sessao
   * de quem pediu (ex.: troca de senha feita pelo proprio usuario).
   */
  async revokeAllForUser(
    userId: string,
    reason: RevokedReason,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.prismaService.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Apaga sessoes e tokens de uso unico ja expirados.
   *
   * Sessoes revogadas ficam ate expirar DE PROPOSITO: sao elas que permitem
   * distinguir "token roubado sendo reapresentado" de "token que nunca
   * existiu". Apagar antes desliga a deteccao de reuso.
   *
   * Engole a propria falha: um job agendado que lanca so polui o log com
   * stack trace a cada hora, sem ninguem para tratar.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    const now = new Date();

    try {
      const [sessions, usedTokens] = await this.prismaService.$transaction([
        this.prismaService.refreshToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        this.prismaService.usedToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
      ]);

      if (sessions.count || usedTokens.count) {
        this.logger.log(
          `Limpeza: ${sessions.count} sessoes e ${usedTokens.count} tokens de uso unico expirados`,
        );
      }
    } catch (error) {
      this.logger.error('Falha na limpeza de sessoes expiradas', error);
    }
  }
}
