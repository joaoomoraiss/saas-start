import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Health check para orquestrador (Docker, Render, Fly...). Confere o banco:
 * uma API de pe que nao alcanca o Postgres nao esta saudavel.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }

    return { status: 'ok' };
  }
}
