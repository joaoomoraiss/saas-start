import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { RevokedReason } from 'generated/prisma/enums';
import { SessionService } from 'src/auth/session.service';
import { isPrismaError } from 'src/common/prisma-error';
import { PaymentsService } from 'src/payments/payments.service';
import { PrismaService } from './../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private prismaService: PrismaService,
    private sessionService: SessionService,
    private paymentsService: PaymentsService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    //check if user with email already exists
    const existingUser = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new UnprocessableEntityException(
        'User with this email already exists',
      );
    }

    //create user
    return this.prismaService.user.create({
      data: {
        email: createUserDto.email,
        name: createUserDto.name ?? null,
        password: await this.hashPassword(createUserDto.password),
        role: 'USER',
      },
    });
  }

  findAll() {
    return this.prismaService.user.findMany();
  }

  async findOne(id: string) {
    //check if user exists
    const user = await this.prismaService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    const data: { password?: string } = {};

    // Only hash password if provided
    if (updateUserDto.password) {
      data.password = await this.hashPassword(updateUserDto.password);
    }

    const user = await this.prismaService.user.update({ where: { id }, data });

    // Senha nova derruba as sessoes abertas com a senha antiga.
    if (data.password) {
      await this.sessionService.revokeAllForUser(
        id,
        RevokedReason.PASSWORD_CHANGE,
      );
    }

    return user;
  }

  /** Fluxo de confirmacao de e-mail. Nao exposto via PATCH. */
  async markAsVerified(id: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  async setPassword(id: string, plainPassword: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { password: await this.hashPassword(plainPassword) },
    });
  }

  /**
   * Cancela a assinatura na Stripe ANTES de apagar a linha. O usuario guarda a
   * unica referencia a assinatura (stripeSubscriptionId): apagando primeiro,
   * uma falha no cancelamento deixa a pessoa sendo cobrada por uma conta que
   * nao existe mais, sem ninguem conseguir achar a assinatura de novo.
   *
   * As cobrancas sobrevivem sem vinculo (FK com SET NULL) e as sessoes caem
   * junto (CASCADE).
   */
  async remove(id: string) {
    //check if user exists
    await this.findOne(id);

    await this.paymentsService.cancelImmediately(id);

    try {
      return await this.prismaService.user.delete({ where: { id } });
    } catch (err: unknown) {
      // Prisma throws P2025 when record to delete does not exist
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundException('User not found');
      }
      throw err;
    }
  }

  /** Exclusao pelo proprio titular (LGPD Art. 18, VI): exige a senha. */
  async deleteOwnAccount(id: string, password: string) {
    await this.assertPassword(id, password);
    await this.remove(id);
  }

  /**
   * Dados do titular em formato legivel (LGPD Art. 18, II e V). O id vem do
   * token — nunca de parametro — pela mesma regra do resto de /user.
   *
   * Identificadores internos da Stripe ficam de fora: sao chaves de
   * correlacao do sistema, nao dados sobre a pessoa.
   */
  async exportData(id: string) {
    const user = await this.findOne(id);

    // Consultas em sequencia, nao um `include` duplo: o include dispara as
    // relacoes em paralelo, e o Postgres em memoria da suite e2e (PGlite)
    // atende uma conexao por vez. Para uma rota rara como esta, o custo e nulo.
    const payments = await this.prismaService.payment.findMany({
      where: { userId: id },
      orderBy: { paidAt: 'desc' },
    });
    const sessions = await this.prismaService.refreshToken.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        plan: user.plan,
        credits: user.credits,
        subscriptionStatus: user.subscriptionStatus,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      payments: payments.map((payment) => ({
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paidAt: payment.paidAt,
        hostedInvoiceUrl: payment.hostedInvoiceUrl,
        invoicePdfUrl: payment.invoicePdfUrl,
      })),
      sessions: sessions.map((session) => ({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        revokedReason: session.revokedReason,
      })),
    };
  }

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({
      where: { email },
    });
  }

  /**
   * Unico caminho que traz o hash de senha, usado apenas na verificacao de
   * login. Todo o resto usa findByEmail, que respeita o omit global.
   */
  findByEmailForAuth(email: string) {
    return this.prismaService.user.findUnique({
      where: { email },
      omit: { password: false },
    });
  }

  /**
   * Shape enxuto consumido pelo frontend. Os identificadores da Stripe ficam
   * de fora de proposito: sao chaves internas de correlacao dos webhooks e
   * nao tem uso no cliente.
   */
  async getProfile(id: string) {
    const user = await this.findOne(id);

    return {
      name: user.name,
      email: user.email,
      plan: user.plan,
      credits: user.credits,
      subscriptionStatus: user.subscriptionStatus,
      isVerified: user.isVerified,
    };
  }

  async updateProfile(id: string, data: { name?: string }) {
    await this.prismaService.user.update({
      where: { id },
      data: { ...(data.name !== undefined && { name: data.name }) },
    });

    return this.getProfile(id);
  }

  /**
   * Troca de senha pelo proprio usuario: exige conferir a senha atual e
   * derruba as OUTRAS sessoes. A de quem trocou continua — deslogar a pessoa
   * que acabou de provar que sabe a senha so atrapalha.
   */
  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string,
  ) {
    await this.assertPassword(
      id,
      currentPassword,
      'Current password is incorrect',
    );

    await this.setPassword(id, newPassword);

    await this.sessionService.revokeAllForUser(
      id,
      RevokedReason.PASSWORD_CHANGE,
      currentSessionId,
    );

    return { message: 'Password updated' };
  }

  hashPassword(plainPassword: string) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  private async assertPassword(
    id: string,
    password: string,
    message = 'Password is incorrect',
  ) {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      omit: { password: false },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException(message);
    }
  }
}
