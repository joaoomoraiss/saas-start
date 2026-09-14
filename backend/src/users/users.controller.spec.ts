import { mock, MockProxy } from 'jest-mock-extended';
import { Reflector } from '@nestjs/core';
import { CHECK_POLICIES_KEY, PolicyHandler } from 'src/casl/policies.decorator';
import { CastAbilityService } from 'src/casl/cast-ability/cast-ability.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const USER = { id: 'user-1', email: 'a@b.com', role: 'USER', isVerified: true };

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: MockProxy<UsersService>;
  let reflector: Reflector;

  // Instanciado direto, sem container: o controller e protegido por guards
  // de classe, e monta-los aqui exigiria arrastar Prisma e TokenService para
  // dentro de um teste que so verifica delegacao. O comportamento real dos
  // guards e coberto em test/users.e2e-spec.ts.
  beforeEach(() => {
    usersService = mock<UsersService>();
    controller = new UsersController(usersService);
    reflector = new Reflector();
  });

  describe('delegacao', () => {
    it('create repassa o DTO', async () => {
      const dto = { email: 'a@b.com', password: 'Str0ng!Passw0rd' };
      usersService.create.mockResolvedValue(USER as any);

      await controller.create(dto);

      expect(usersService.create).toHaveBeenCalledWith(dto);
    });

    it('findAll delega ao service', async () => {
      usersService.findAll.mockResolvedValue([USER] as any);

      await expect(controller.findAll()).resolves.toEqual([USER]);
    });

    it('findOne repassa o id', async () => {
      usersService.findOne.mockResolvedValue(USER as any);

      await controller.findOne('user-1');

      expect(usersService.findOne).toHaveBeenCalledWith('user-1');
    });

    it('update repassa id e DTO', async () => {
      const dto = { password: 'N3w!Passw0rd' };
      usersService.update.mockResolvedValue(USER as any);

      await controller.update('user-1', dto);

      expect(usersService.update).toHaveBeenCalledWith('user-1', dto);
    });

    it('remove repassa o id', async () => {
      usersService.remove.mockResolvedValue(USER as any);

      await controller.remove('user-1');

      expect(usersService.remove).toHaveBeenCalledWith('user-1');
    });
  });

  describe('rotas do proprio titular (id do token, nunca de parametro)', () => {
    const request = { user: USER, sessionId: 'sess-1' } as any;

    it('exportMyData usa o id do token', async () => {
      await controller.exportMyData(request);

      expect(usersService.exportData).toHaveBeenCalledWith('user-1');
    });

    it('deleteMyAccount usa o id do token e repassa a senha', async () => {
      await controller.deleteMyAccount(request, { password: 'minha-senha' });

      expect(usersService.deleteOwnAccount).toHaveBeenCalledWith(
        'user-1',
        'minha-senha',
      );
    });

    it('changePassword preserva a sessao de quem pediu', async () => {
      await controller.changePassword(request, {
        currentPassword: 'atual',
        newPassword: 'N0va!Senha123',
      });

      expect(usersService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'atual',
        'N0va!Senha123',
        'sess-1',
      );
    });

    it.each(['exportMyData', 'deleteMyAccount'] as const)(
      '%s nao exige papel ADMIN',
      (handler) => {
        expect(
          reflector.get('roles', UsersController.prototype[handler] as any),
        ).toBeUndefined();
      },
    );
  });

  /**
   * Autorizacao declarada por decorator e facil de remover sem querer numa
   * refatoracao, e a rota fica aberta em silencio. Estes testes leem os
   * metadados e falham se a protecao sumir.
   */
  describe('metadados de autorizacao', () => {
    const rolesFor = (handler: keyof UsersController) =>
      reflector.get<string[]>(
        'roles',
        UsersController.prototype[handler] as any,
      );

    const policiesFor = (handler: keyof UsersController) =>
      reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        UsersController.prototype[handler] as any,
      );

    it.each(['create', 'findAll', 'remove'] as const)(
      '%s exige papel ADMIN',
      (handler) => {
        expect(rolesFor(handler)).toEqual(['ADMIN']);
      },
    );

    it.each(['findOne', 'update'] as const)(
      '%s exige politica CASL',
      (handler) => {
        expect(policiesFor(handler)).toHaveLength(1);
      },
    );

    it('a politica de update aprova o proprio registro e reprova o alheio', () => {
      const [policy] = policiesFor('update');
      const ability = new CastAbilityService().createForUser({
        id: 'user-1',
        role: 'USER',
      });

      expect(policy(ability, { params: { id: 'user-1' } } as any)).toBe(true);
      expect(policy(ability, { params: { id: 'user-2' } } as any)).toBe(false);
    });

    it('a politica de leitura aprova o proprio registro e reprova o alheio', () => {
      const [policy] = policiesFor('findOne');
      const ability = new CastAbilityService().createForUser({
        id: 'user-1',
        role: 'USER',
      });

      expect(policy(ability, { params: { id: 'user-1' } } as any)).toBe(true);
      expect(policy(ability, { params: { id: 'user-2' } } as any)).toBe(false);
    });

    it('ADMIN atende as politicas de qualquer registro', () => {
      const [policy] = policiesFor('update');
      const ability = new CastAbilityService().createForUser({
        id: 'admin-1',
        role: 'ADMIN',
      });

      expect(policy(ability, { params: { id: 'outro' } } as any)).toBe(true);
    });
  });
});
