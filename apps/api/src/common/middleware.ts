import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { contextStore } from './context';

/** Creates the per-request store (correlation id, ip). The auth guard later fills in identity. */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction) {
    const incoming = req.header('x-correlation-id');
    const correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    contextStore.run({ correlationId, ip: req.ip ?? null }, next);
  }
}
