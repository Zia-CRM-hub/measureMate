import { Injectable, OnModuleInit } from '@nestjs/common';
import { PERMISSIONS, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS } from '@measuremate/validation';
import { PLANS } from './plans';
import { PrismaService } from './prisma.service';

/** Idempotently upserts global reference data (permissions, roles, plans) at startup. */
@Injectable()
export class ReferenceDataService implements OnModuleInit {
  constructor(private readonly db: PrismaService) {}

  async onModuleInit() {
    await this.sync();
  }

  async sync() {
    for (const key of PERMISSIONS) await this.db.permission.upsert({ where: { key }, update: {}, create: { key } });
    for (const key of ROLE_KEYS) {
      await this.db.role.upsert({ where: { key }, update: { name: ROLE_LABELS[key] }, create: { key, name: ROLE_LABELS[key] } });
      await this.db.rolePermission.deleteMany({ where: { roleKey: key } });
      await this.db.rolePermission.createMany({
        data: ROLE_PERMISSIONS[key].map((permissionKey) => ({ roleKey: key, permissionKey })),
        skipDuplicates: true,
      });
    }
    for (const p of PLANS) {
      const plan = await this.db.plan.upsert({
        where: { key: p.key },
        update: { name: p.name, priceMonthly: p.priceMonthly },
        create: { key: p.key, name: p.name, priceMonthly: p.priceMonthly },
      });
      const rows = [
        ...Object.entries(p.limits).map(([key, intValue]) => ({ planId: plan.id, key, intValue, enabled: true })),
        ...Object.entries(p.features).map(([k, enabled]) => ({ planId: plan.id, key: `feature.${k}`, intValue: null, enabled })),
      ];
      for (const r of rows) {
        await this.db.planFeature.upsert({
          where: { planId_key: { planId: r.planId, key: r.key } },
          update: { intValue: r.intValue, enabled: r.enabled },
          create: r,
        });
      }
    }
  }
}
