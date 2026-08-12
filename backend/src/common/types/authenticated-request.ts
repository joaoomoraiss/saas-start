import { Request } from 'express';
import { User } from 'generated/prisma/browser';
import { AppAbility } from 'src/casl/cast-ability/cast-ability.service';

/**
 * Usuario autenticado, sem o hash de senha.
 *
 * O Omit nao e cosmetico: o client Prisma tambem omite a coluna, entao o tipo
 * descreve o que de fato existe em memoria. Qualquer tentativa de ler
 * `request.user.password` vira erro de compilacao.
 */
export type AuthUser = Omit<User, 'password'>;

/**
 * Request depois do AuthGuard. Substitui os `(request as any)` espalhados
 * pelos guards — que, alem de perderem a checagem de tipo, escondiam de quem
 * le o codigo qual guard precisa ter rodado antes.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  ability: AppAbility;
}
