import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { z } from 'zod';

/** Parameter decorator exposing the zod-validated query (see ValidatesQuery). */
export const Q = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.validatedQuery ?? req.query;
});

export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().regex(/^[a-zA-Z]+$/).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
};

export function paged<T>(rows: T[], total: number, page: number, pageSize: number) {
  return { data: rows, meta: { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
