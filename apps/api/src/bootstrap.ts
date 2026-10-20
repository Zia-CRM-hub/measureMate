import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { loadConfig } from './common/config';

/** Shared by main.ts and the test harness so tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication) {
  const cfg = loadConfig();
  app.setGlobalPrefix('api/v1');
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cookieParser());
  app.enableCors({ origin: cfg.WEB_ORIGIN.split(','), credentials: true, exposedHeaders: ['x-correlation-id', 'content-disposition'] });
  const set = (app.getHttpAdapter().getInstance() as import('express').Express);
  set.set('trust proxy', 1);
  set.disable('x-powered-by');

  const doc = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('MeasureMate API').setDescription('Multi-tenant tailoring & boutique management API').setVersion('1.0')
    .addBearerAuth().addCookieAuth('mm_session').build());
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/openapi.json' });
}
