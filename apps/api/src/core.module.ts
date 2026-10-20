import { Global, Module } from '@nestjs/common';
import { AuditService } from './common/audit.service';
import { EntitlementsService } from './common/entitlements.service';
import { PrismaService } from './common/prisma.service';
import { ReferenceDataService } from './common/reference-data.service';
import { SessionService } from './modules/auth/session.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, EntitlementsService, ReferenceDataService, SessionService],
  exports: [PrismaService, AuditService, EntitlementsService, ReferenceDataService, SessionService],
})
export class CoreModule {}
