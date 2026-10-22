import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Permission } from '@measuremate/validation';

export const IS_PUBLIC = 'isPublic';
export const PERMS = 'perms';
export const FEATURE = 'feature';
export const ZOD_BODY = 'zodBody';
export const ZOD_QUERY = 'zodQuery';
export const IDEMPOTENT = 'idempotent';
export const PLATFORM_ONLY = 'platformOnly';
export const NO_TENANT = 'noTenant';

/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route requires ALL listed permissions in the active tenant. */
export const Perm = (...p: Permission[]) => SetMetadata(PERMS, p);
/** Route requires a plan feature (e.g. "inventory"). */
export const RequireFeature = (key: string) => SetMetadata(FEATURE, key);
/** Route requires a platform administrator and no tenant context. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);
/** Authenticated route that does not need an active tenant (e.g. tenant switching). */
export const NoTenant = () => SetMetadata(NO_TENANT, true);
/** Honour the Idempotency-Key header for this write endpoint. */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

/** Validate (and coerce) the JSON body with a zod schema; also documents it in OpenAPI. */
export const Validates = (schema: ZodTypeAny) =>
  applyDecorators(
    SetMetadata(ZOD_BODY, schema),
    ApiBody({ schema: zodToJsonSchema(schema as any, { target: 'openApi3', $refStrategy: 'none' } as any) as Record<string, unknown> }),
  );
/** Validate and coerce query string. Result is exposed on req.validatedQuery. */
export const ValidatesQuery = (schema: ZodTypeAny) => SetMetadata(ZOD_QUERY, schema);

