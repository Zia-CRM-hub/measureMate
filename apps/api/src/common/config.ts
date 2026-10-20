import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  COOKIE_SECURE: z.string().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  OIDC_ISSUER: z.string().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('MeasureMate <no-reply@measuremate.local>'),
  STORAGE_DIR: z.string().default('./storage'),
  WORKER_ENABLED: z.string().default('true'),
  PLATFORM_ADMIN_EMAIL: z.string().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema> & { sessionSecret: string; isProd: boolean; cookieSecure: boolean };

let cached: AppConfig | null = null;

/** Validates the environment once at startup and fails fast with a readable message. */
export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';
  if (isProd && !env.SESSION_SECRET) throw new Error('SESSION_SECRET (>=32 chars) is required in production');
  cached = {
    ...env,
    isProd,
    sessionSecret: env.SESSION_SECRET ?? 'dev-only-insecure-session-secret-change-me-0000',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  };
  return cached;
}

export function resetConfigForTests() { cached = null; }
