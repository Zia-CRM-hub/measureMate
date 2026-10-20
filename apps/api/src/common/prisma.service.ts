import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { maybeContext } from './context';

export type Tx = Prisma.TransactionClient;

export interface RunOptions {
  /** Explicit tenant (e.g. registration, background workers). Defaults to the request's tenant. */
  tenantId?: string | null;
  userId?: string | null;
  /** Bypass tenant isolation. ONLY for platform administration and background workers. */
  platform?: boolean;
  purge?: boolean;
  timeout?: number;
}

/**
 * All tenant data access goes through run(): every call is one transaction that first sets the
 * PostgreSQL session variables used by Row-Level Security. Code that forgets to use run() sees no
 * tenant rows at all (fail-closed), because the database role has no BYPASSRLS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  run<T>(fn: (tx: Tx) => Promise<T>, opts: RunOptions = {}): Promise<T> {
    const ctx = maybeContext();
    const tenantId = opts.tenantId !== undefined ? opts.tenantId : ctx?.tenantId ?? null;
    const userId = opts.userId !== undefined ? opts.userId : ctx?.userId ?? null;
    const platform = opts.platform ? 'on' : 'off';
    return this.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true),
          set_config('app.user_id', ${userId ?? ''}, true),
          set_config('app.platform', ${platform}, true),
          set_config('app.purge', ${opts.purge ? 'on' : 'off'}, true)`;
        return fn(tx);
      },
      { timeout: opts.timeout ?? 20000, maxWait: 10000 },
    );
  }
}
