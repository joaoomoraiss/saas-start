import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
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

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new UsersService(prisma);
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

    it('hasheia a senha nova', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.update.mockResolvedValue(USER as any);

      await service.update(USER.id, { password: PASSWORD });

      const { password } = prisma.user.update.mock.calls[0][0].data as {
        password: string;
      };
      expect(await bcrypt.compare(PASSWORD, password)).toBe(true);
    });

    it('nao mexe na senha quando o DTO nao traz uma', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      prisma.user.update.mockResolvedValue(USER as any);

      await service.update(USER.id, {});

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({});
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
    it('lanca 404 quando nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('sumiu')).rejects.toThrow(NotFoundException);
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
});
