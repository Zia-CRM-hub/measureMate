import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/errors';
import { IdempotencyInterceptor, ZodInterceptor } from './common/interceptors';
import { ContextMiddleware } from './common/middleware';
import { CoreModule } from './core.module';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { TenantController } from './modules/tenant/tenant.controller';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 600, ttl: 60_000 }],
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_TEST !== 'on',
    }),
  ],
  controllers: [HealthController, AuthController, TenantController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ZodInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
