import {
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { DeepMockProxy, mock, mockDeep, MockProxy } from 'jest-mock-extended';
import { SessionService } from 'src/auth/session.service';
import { PaymentsService } from 'src/payments/payments.service';
import { PrismaService } from './../prisma/prisma.service';
import { UsersService } from './users.service';

const PASSWORD = 'Str0ng!Passw0rd';
const USER = {
  id: 'user-1',
  email: 'a@b.com',
  role: 'USER',
  isVerified: false,
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;
  let sessionService: MockProxy<SessionService>;
  let paymentsService: MockProxy<PaymentsService>;

  async function comSenha(senha: string, extra: Record<string, unknown> = {}) {
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      ...extra,
      password: await bcrypt.hash(senha, 4),
    } as any);
  }

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    sessionService = mock<SessionService>();
    paymentsService = mock<PaymentsService>();
    service = new UsersService(prisma, sessionService, paymentsService);
  });

  describe('create', () => {
    it('recusa e-mail ja cadastrado', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(
        service.create({ email: USER.email, password: PASSWORD }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('nunca grava a senha em texto plano', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(USER as any);

      await service.create({ email: USER.email, password: PASSWORD });

      const gravado = prisma.user.create.mock.calls[0][0].data as {
        password: string;
      };
      expect(gravado.password).not.toBe(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, gravado.password)).toBe(true);
    });

    it('gera hash diferente para a mesma senha (salt por usuario)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(USER as any);

      await service.create({ email: 'a@b.com', password: PASSWORD });
      await service.create({ email: 'c@d.com', password: PASSWORD });

      const [primeiro, segundo] = prisma.user.create.mock.calls.map(
        ([args]) => (args.data as { password: string }).password,
      );
      expect(primeiro).not.toBe(segundo);
    });

    // Papel vem fixo do service: um DTO nunca decide privilegio.
    it('cria sempre com papel USER', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(USER as any);

      await service.create({ email: USER.email, password: PASSWORD });

      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        role: 'USER',
      });
    });
  });

  describe('findOne', () => {
    it('devolve o usuario encontrado', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(service.findOne(USER.id)).resolves.toEqual(USER);
    });

    it('lanca 404 quando nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('sumiu')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('lanca 404 antes de tentar atualizar', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('sumiu', { password: PASSWORD }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hasheia a senha nova e derruba as sessoes abertas', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.update.mockResolvedValue(USER as any);

      await service.update(USER.id, { password: PASSWORD });

      const { password } = prisma.user.update.mock.calls[0][0].data as {
        password: string;
      };
      expect(await bcrypt.compare(PASSWORD, password)).toBe(true);
      expect(sessionService.revokeAllForUser).toHaveBeenCalledWith(
        USER.id,
        'PASSWORD_CHANGE',
      );
    });

    it('nao mexe na senha nem nas sessoes quando o DTO nao traz senha', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.update.mockResolvedValue(USER as any);

      await service.update(USER.id, {});

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({});
      expect(sessionService.revokeAllForUser).not.toHaveBeenCalled();
    });

    // A porta pela qual passava a autoverificacao e a autopromocao.
    it('ignora campos fora do DTO, mesmo se chegarem ate aqui', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.update.mockResolvedValue(USER as any);

      await service.update(USER.id, {
        isVerified: true,
        role: 'ADMIN',
      } as any);

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({});
    });
  });

  describe('markAsVerified', () => {
    it('marca somente o campo isVerified', async () => {
      prisma.user.update.mockResolvedValue(USER as any);

      await service.markAsVerified(USER.id);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { isVerified: true },
      });
    });
  });

  describe('setPassword', () => {
    it('grava a nova senha hasheada', async () => {
      prisma.user.update.mockResolvedValue(USER as any);

      await service.setPassword(USER.id, PASSWORD);

      const { password } = prisma.user.update.mock.calls[0][0].data as {
        password: string;
      };
      expect(await bcrypt.compare(PASSWORD, password)).toBe(true);
    });
  });

  describe('remove', () => {
    it('lanca 404 quando nao existe, sem tocar na Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('sumiu')).rejects.toThrow(NotFoundException);
      expect(paymentsService.cancelImmediately).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    // Apagar primeiro deixaria a assinatura cobrando uma conta que nao existe.
    it('cancela a assinatura ANTES de apagar o usuario', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.delete.mockResolvedValue(USER as any);

      await service.remove(USER.id);

      expect(paymentsService.cancelImmediately).toHaveBeenCalledWith(USER.id);
      expect(
        paymentsService.cancelImmediately.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.user.delete.mock.invocationCallOrder[0]);
    });

    it('nao apaga se o cancelamento na Stripe falhar', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      paymentsService.cancelImmediately.mockRejectedValue(
        new Error('Stripe fora'),
      );

      await expect(service.remove(USER.id)).rejects.toThrow('Stripe fora');
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('traduz P2025 em 404', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.delete.mockRejectedValue({ code: 'P2025' });

      await expect(service.remove(USER.id)).rejects.toThrow(NotFoundException);
    });

    it('propaga erros que nao sao P2025', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.delete.mockRejectedValue(new Error('conexao caiu'));

      await expect(service.remove(USER.id)).rejects.toThrow('conexao caiu');
    });
  });

  describe('deleteOwnAccount', () => {
    it('recusa com senha errada e nao apaga nada', async () => {
      await comSenha(PASSWORD);

      await expect(service.deleteOwnAccount(USER.id, 'errada')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(paymentsService.cancelImmediately).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('com a senha certa, cancela a assinatura e apaga', async () => {
      await comSenha(PASSWORD);
      prisma.user.delete.mockResolvedValue(USER as any);

      await service.deleteOwnAccount(USER.id, PASSWORD);

      expect(paymentsService.cancelImmediately).toHaveBeenCalledWith(USER.id);
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER.id },
      });
    });
  });

  describe('exportData', () => {
    it('lanca 404 quando o usuario nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData('sumiu')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('exporta conta, cobrancas e sessoes sem senha nem ids da Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        name: 'Joao',
        plan: 'PRO',
        credits: 10,
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      } as any);
      prisma.payment.findMany.mockResolvedValue([
        {
          plan: 'PRO',
          amount: 9900,
          currency: 'brl',
          status: 'PAID',
          paidAt: new Date('2026-02-01'),
          hostedInvoiceUrl: null,
          invoicePdfUrl: null,
          stripeInvoiceId: 'in_1',
        },
      ] as any);
      prisma.refreshToken.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-03-01'),
          expiresAt: new Date('2026-03-31'),
          revokedAt: null,
          revokedReason: null,
          tokenHash: 'hash-secreto',
        },
      ] as any);

      const data = await service.exportData(USER.id);

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER.id } }),
      );
      expect(data.account).toMatchObject({ email: USER.email, plan: 'PRO' });
      expect(data.payments).toHaveLength(1);
      expect(data.sessions).toHaveLength(1);

      const json = JSON.stringify(data);
      expect(json).not.toContain('cus_1');
      expect(json).not.toContain('sub_1');
      expect(json).not.toContain('in_1');
      expect(json).not.toContain('hash-secreto');
      expect(json).not.toContain('password');
    });
  });

  describe('busca por e-mail', () => {
    it('findByEmail respeita o omit global da senha', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.findByEmail(USER.email);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: USER.email },
      });
    });

    // Unico ponto autorizado a trazer o hash, usado so na conferencia de login.
    it('findByEmailForAuth pede a senha explicitamente', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.findByEmailForAuth(USER.email);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: USER.email },
        omit: { password: false },
      });
    });
  });

  describe('perfil', () => {
    const PERFIL = {
      ...USER,
      name: 'Joao',
      plan: 'STANDARD',
      credits: 42,
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    };

    it('getProfile nao expoe os identificadores da Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue(PERFIL as any);

      const profile = await service.getProfile(USER.id);

      expect(profile).toEqual({
        name: 'Joao',
        email: USER.email,
        plan: 'STANDARD',
        credits: 42,
        subscriptionStatus: 'active',
        isVerified: false,
      });
      expect(profile).not.toHaveProperty('stripeCustomerId');
      expect(profile).not.toHaveProperty('stripeSubscriptionId');
      expect(profile).not.toHaveProperty('password');
    });

    it('getProfile propaga 404 de usuario inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updateProfile grava apenas o nome', async () => {
      prisma.user.findUnique.mockResolvedValue(PERFIL as any);

      await service.updateProfile(USER.id, { name: 'Novo Nome' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { name: 'Novo Nome' },
      });
    });

    it('updateProfile sem campos nao sobrescreve nada', async () => {
      prisma.user.findUnique.mockResolvedValue(PERFIL as any);

      await service.updateProfile(USER.id, {});

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: {},
      });
    });
  });

  describe('changePassword', () => {
    it('recusa quando a senha atual esta errada', async () => {
      await comSenha(PASSWORD);

      await expect(
        service.changePassword(USER.id, 'senha-errada', 'N0va!Senha'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sessionService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('grava a nova senha com hash quando a atual confere', async () => {
      await comSenha(PASSWORD);

      await service.changePassword(USER.id, PASSWORD, 'N0va!Senha');

      const data = prisma.user.update.mock.calls[0][0].data as {
        password: string;
      };
      expect(data.password).not.toBe('N0va!Senha');
      expect(await bcrypt.compare('N0va!Senha', data.password)).toBe(true);
    });

    it('derruba as outras sessoes e preserva a de quem trocou', async () => {
      await comSenha(PASSWORD);

      await service.changePassword(
        USER.id,
        PASSWORD,
        'N0va!Senha',
        'sess-atual',
      );

      expect(sessionService.revokeAllForUser).toHaveBeenCalledWith(
        USER.id,
        'PASSWORD_CHANGE',
        'sess-atual',
      );
    });

    it('404 quando o usuario nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nao-existe', PASSWORD, 'N0va!Senha'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
