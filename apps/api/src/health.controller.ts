import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';
import { PrismaService } from './common/prisma.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Public() @Get('health')
  health() { return { status: 'ok' }; }

  @Public() @Get('ready')
  async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'up' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
