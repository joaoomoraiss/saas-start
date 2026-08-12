import { AbilityBuilder, PureAbility, subject } from '@casl/ability';
import { createPrismaAbility, PrismaQuery, Subjects } from '@casl/prisma';
import { Injectable } from '@nestjs/common';
import { User, Role } from 'generated/prisma/browser';

export type PermActions = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type PermissionResource = Subjects<{ User: User }>;

export type AppAbility = PureAbility<
  [PermActions, PermissionResource],
  PrismaQuery
>;

/**
 * O minimo necessario para derivar permissoes. Deliberadamente nao e `User`:
 * o hash de senha e omitido do client Prisma e nunca chega ate aqui.
 */
export type AbilityUser = { id: string; role: Role };

/**
 * Marca um id como recurso 'User' para as checagens do CASL.
 *
 * O cast fica confinado aqui: as regras so consultam `id`, mas a assinatura
 * do @casl/prisma pede o modelo inteiro. Centralizar evita um `as any` solto
 * em cada handler que declara uma politica.
 */
export const userSubject = (id: string) =>
  subject('User', { id } as unknown as User);

export type DefinePermissions = (
  user: AbilityUser,
  builder: AbilityBuilder<AppAbility>,
) => void;

const rolePermissions: Record<Role, DefinePermissions> = {
  ADMIN(user, { can }) {
    can('manage', 'User');
  },
  USER(user, { can }) {
    // allow user to read/update their own user record
    can('read', 'User', { id: user.id });
    can('update', 'User', { id: user.id });
  },
};

@Injectable()
export class CastAbilityService {
  createForUser(user: AbilityUser): AppAbility {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    const define = rolePermissions[user.role] ?? rolePermissions.USER;
    define(user, builder);
    return builder.build();
  }
}
