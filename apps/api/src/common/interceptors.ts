import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { from, Observable, of } from 'rxjs';
import { ZodTypeAny } from 'zod';
import { badRequest, conflict } from './errors';
import { IDEMPOTENT, ZOD_BODY, ZOD_QUERY } from './decorators';
import { currentContext, maybeContext } from './context';
import { PrismaService } from './prisma.service';

@Injectable()
export class ZodInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const body = this.reflector.get<ZodTypeAny | undefined>(ZOD_BODY, ctx.getHandler());
    if (body) {
      const r = body.safeParse(req.body ?? {});
      if (!r.success) {
        throw badRequest('VALIDATION_FAILED', 'Some fields need attention', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
      }
      req.body = r.data;
    }
    const q = this.reflector.get<ZodTypeAny | undefined>(ZOD_QUERY, ctx.getHandler());
    if (q) {
      const r = q.safeParse(req.query ?? {});
      if (!r.success) {
        throw badRequest('VALIDATION_FAILED', 'Invalid query parameters', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
      }
      req.validatedQuery = r.data;
    }
    return next.handle();
  }
}

/** Replays the stored response for a repeated Idempotency-Key within the same tenant and endpoint. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly db: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ctx.getHandler())) return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = req.header('idempotency-key');
    if (!key) return next.handle();
    if (!/^[\w-]{8,100}$/.test(key)) throw badRequest('BAD_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-100 characters (letters, digits, - or _)');
    const tenantId = maybeContext()?.tenantId;
    if (!tenantId) return next.handle();
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;

    return from((async () => {
      const claimed = await this.db.run(async (tx) => {
        const existing = await tx.idempotencyKey.findUnique({ where: { tenantId_key_endpoint: { tenantId, key, endpoint } } });
        if (existing) return existing;
        await tx.idempotencyKey.create({ data: { tenantId, key, endpoint } });
        return null;
      });
      if (claimed) {
        if (claimed.response === null || claimed.statusCode === null) throw conflict('REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed');
        res.status(claimed.statusCode);
        res.setHeader('Idempotent-Replay', 'true');
        return claimed.response;
      }
      try {
        const out = await next.handle().toPromise();
        await this.db.run((tx) => tx.idempotencyKey.update({
          where: { tenantId_key_endpoint: { tenantId, key, endpoint } },
          data: { response: (out ?? {}) as Prisma.InputJsonValue, statusCode: res.statusCode },
        }));
        return out;
      } catch (e) {
        await this.db.run((tx) => tx.idempotencyKey.deleteMany({ where: { tenantId, key, endpoint } })).catch(() => undefined);
        throw e;
      }
    })());
  }
}

// Re-export so unused import lint stays quiet when helpers are tree-shaken.
export { of, currentContext };
