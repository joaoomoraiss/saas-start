import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(private configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.get<string>('DATABASE_URL'),
    });

    super({
      adapter,
      // O hash de senha nunca sai do banco por acidente. As unicas consultas
      // que precisam dele pedem explicitamente com `omit: { password: false }`.
      omit: { user: { password: true } },
    });
  }
}
