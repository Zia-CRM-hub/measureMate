import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

export async function createApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

let counter = 0;
export const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface Tenant { token: string; tenantId: string; email: string; password: string; name: string }

export async function registerTenant(app: INestApplication, name = `Atelier ${uniq()}`): Promise<Tenant> {
  const email = `owner-${uniq()}@example.test`;
  const password = 'Sup3r-secret-pass';
  const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
    businessName: name, ownerName: 'Test Owner', email, password, country: 'IN', currency: 'INR',
    timeZone: 'Asia/Kolkata', measurementUnit: 'in',
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, tenantId: res.body.tenantId, email, password, name };
}

export const as = (app: INestApplication, token: string) => {
  const h = () => app.getHttpServer();
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(h()).get(`/api/v1${url}`).set(auth),
    post: (url: string, body: object = {}) => request(h()).post(`/api/v1${url}`).set(auth).send(body),
    patch: (url: string, body: object = {}) => request(h()).patch(`/api/v1${url}`).set(auth).send(body),
    put: (url: string, body: object = {}) => request(h()).put(`/api/v1${url}`).set(auth).send(body),
    del: (url: string) => request(h()).delete(`/api/v1${url}`).set(auth),
  };
};
