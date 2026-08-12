import { subject } from '@casl/ability';
import { CastAbilityService } from './cast-ability.service';

describe('CastAbilityService', () => {
  const service = new CastAbilityService();

  const abilityFor = (id: string, role: 'USER' | 'ADMIN') =>
    service.createForUser({ id, role });

  describe('USER', () => {
    const ability = abilityFor('user-1', 'USER');

    it('le o proprio registro', () => {
      expect(
        ability.can('read', subject('User', { id: 'user-1' } as any)),
      ).toBe(true);
    });

    it('atualiza o proprio registro', () => {
      expect(
        ability.can('update', subject('User', { id: 'user-1' } as any)),
      ).toBe(true);
    });

    it('nao le o registro alheio', () => {
      expect(
        ability.can('read', subject('User', { id: 'user-2' } as any)),
      ).toBe(false);
    });

    // A regra que sustenta o bloqueio de takeover de conta.
    it('nao atualiza o registro alheio', () => {
      expect(
        ability.can('update', subject('User', { id: 'user-2' } as any)),
      ).toBe(false);
    });

    it('nao apaga nem o proprio registro', () => {
      expect(
        ability.can('delete', subject('User', { id: 'user-1' } as any)),
      ).toBe(false);
    });

    it('nao cria usuarios', () => {
      expect(ability.can('create', 'User')).toBe(false);
    });
  });

  describe('ADMIN', () => {
    const ability = abilityFor('admin-1', 'ADMIN');

    it.each(['read', 'update', 'delete', 'create'] as const)(
      'pode %s qualquer usuario',
      (action) => {
        expect(
          ability.can(action, subject('User', { id: 'outro' } as any)),
        ).toBe(true);
      },
    );
  });

  it('trata papel desconhecido como USER, em vez de liberar tudo', () => {
    const ability = service.createForUser({
      id: 'user-1',
      role: 'GHOST' as any,
    });

    expect(ability.can('read', subject('User', { id: 'user-1' } as any))).toBe(
      true,
    );
    expect(ability.can('read', subject('User', { id: 'user-2' } as any))).toBe(
      false,
    );
  });
});
