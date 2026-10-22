import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

/** Boots a throwaway real PostgreSQL, applies the real migrations and exposes URLs via env. */
// embedded-postgres is ESM-only; load it with a native dynamic import.
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

export default async function setup() {
  const EmbeddedPostgres = (await dynamicImport('embedded-postgres')).default;
  const port = 55000 + Math.floor(Math.random() * 2000);
  const dir = mkdtempSync(join(tmpdir(), 'mm-test-pg-'));
  const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false });
  await server.initialise();
  await server.start();
  await server.createDatabase('mm_test');
  const admin = new Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'mm_test' });
  await admin.connect();
  await admin.query("CREATE ROLE mm_app LOGIN PASSWORD 'mm_app' NOSUPERUSER NOBYPASSRLS");
  await admin.end();

  const owner = `postgresql://postgres:postgres@localhost:${port}/mm_test`;
  const app = `postgresql://mm_app:mm_app@localhost:${port}/mm_test`;
  process.env.DATABASE_URL = app;
  process.env.DIRECT_URL = owner;
  process.env.OWNER_DATABASE_URL = owner;
  process.env.NODE_ENV = 'test';
  process.env.WORKER_ENABLED = 'false';
  process.env.STORAGE_DIR = join(dir, 'storage');
  const prismaCli = require.resolve('prisma/build/index.js');
  execSync(`node "${prismaCli}" migrate deploy`, { stdio: 'pipe', env: process.env, cwd: join(__dirname, '..') });
  (globalThis as unknown as { __pg: { stop(): Promise<void> } }).__pg = server;
}


