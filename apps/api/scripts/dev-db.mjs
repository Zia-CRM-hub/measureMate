// Starts a local PostgreSQL (embedded binaries) for development when Docker is unavailable.
// Creates database "measuremate" and a non-superuser application role "mm_app" so that
// Row-Level Security is actually enforced (superusers bypass RLS).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { existsSync } from 'node:fs';

const port = Number(process.env.PGPORT ?? 54320);
const dir = process.env.PGDATA_DIR ?? '.pgdata';
const fresh = !existsSync(dir);

const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true });
if (fresh) await server.initialise();
await server.start();

if (fresh) {
  await server.createDatabase('measuremate');
  const c = new pg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'measuremate' });
  await c.connect();
  await c.query("CREATE ROLE mm_app LOGIN PASSWORD 'mm_app' NOSUPERUSER NOBYPASSRLS");
  await c.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await c.query('GRANT ALL ON SCHEMA public TO mm_app');
  await c.end();
}
console.log(`PostgreSQL ready on localhost:${port}  (owner: postgres/postgres, app role: mm_app/mm_app)`);
process.on('SIGINT', async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
