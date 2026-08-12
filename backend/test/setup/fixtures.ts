import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { Role } from 'generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';

export const VALID_PASSWORD = 'Str0ng!Passw0rd';

interface UserOverrides {
  email?: string;
  password?: string;
  role?: Role;
  isVerified?: boolean;
}

let sequence = 0;

/** E-mails unicos por chamada: nenhum teste depende da ordem de execucao. */
export function uniqueEmail(prefix = 'user'): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Date.now()}@example.com`;
}

export async function createUser(
  prisma: PrismaService,
  overrides: UserOverrides = {},
) {
  const password = overrides.password ?? VALID_PASSWORD;

  return prisma.user.create({
    data: {
      email: overrides.email ?? uniqueEmail(),
      password: await bcrypt.hash(password, 4), // custo baixo: e teste, nao producao
      role: overrides.role ?? 'USER',
      isVerified: overrides.isVerified ?? true,
    },
  });
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  token: string;
  refreshCookie: string;
}

/** Cria um usuario e devolve as credenciais ja autenticadas. */
export async function createAndLogin(
  app: INestApplication,
  prisma: PrismaService,
  overrides: UserOverrides = {},
): Promise<AuthenticatedUser> {
  const password = overrides.password ?? VALID_PASSWORD;
  const user = await createUser(prisma, { ...overrides, password });

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: user.email, password })
    .expect(200);

  return {
    id: user.id,
    email: user.email,
    token: response.body.token,
    refreshCookie: extractCookie(response, 'refreshToken'),
  };
}

export function extractCookie(
  response: request.Response,
  name: string,
): string {
  const cookies = response.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  return cookies?.find((cookie) => cookie.startsWith(`${name}=`)) ?? '';
}
