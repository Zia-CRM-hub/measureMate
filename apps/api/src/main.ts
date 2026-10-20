import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './common/config';

async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: cfg.isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'] });
  app.enableShutdownHooks();
  configureApp(app);
  await app.listen(cfg.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`MeasureMate API listening on :${cfg.PORT} (docs at /api/docs)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
