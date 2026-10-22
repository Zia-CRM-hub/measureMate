import { Injectable } from '@nestjs/common';
import { AppError } from './errors';
import { PrismaService, Tx } from './prisma.service';

export interface Entitlements { plan: string; status: string; limits: Record<string, number>; features: Record<string, boolean> }

@Injectable()
export class EntitlementsService {
  // Cache is keyed by tenant id, so tenants can never see each other's entries.
  private cache = new Map<string, { at: number; value: Entitlements }>();
  constructor(private readonly db: PrismaService) {}

  invalidate(tenantId: string) { this.cache.delete(tenantId); }

  async get(tenantId: string, tx?: Tx): Promise<Entitlements> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < 15_000 && !tx) return hit.value;
    const load = async (t: Tx) => {
      const sub = await t.subscription.findUnique({ where: { tenantId }, include: { plan: { include: { features: true } } } });
      const value: Entitlements = { plan: 'NONE', status: 'NONE', limits: {}, features: {} };
      if (sub) {
        value.plan = sub.plan.key;
        value.status = sub.status;
        for (const f of sub.plan.features) {
          if (f.key.startsWith('feature.')) value.features[f.key.slice(8)] = f.enabled;
          else if (f.intValue !== null) value.limits[f.key] = f.intValue;
        }
      }
      return value;
    };
    const value = tx ? await load(tx) : await this.db.run(load, { tenantId });
    this.cache.set(tenantId, { at: Date.now(), value });
    return value;
  }

  async assertFeature(tenantId: string, feature: string) {
    const e = await this.get(tenantId);
    if (e.status === 'CANCELLED' || e.status === 'NONE' || !e.features[feature]) {
      throw new AppError(402, 'PLAN_FEATURE_UNAVAILABLE', `Your ${e.plan.toLowerCase()} plan does not include ${feature.replace('_', ' ')}. Upgrade to enable it.`, { feature, plan: e.plan });
    }
  }

  /** Throw 402 if adding one more would exceed the plan limit. `current` is the present count. */
  async assertWithinLimit(tx: Tx, tenantId: string, limitKey: string, current: number) {
    const e = await this.get(tenantId, tx);
    const limit = e.limits[limitKey];
    if (limit !== undefined && limit >= 0 && current >= limit) {
      throw new AppError(402, 'PLAN_LIMIT_REACHED', `Your plan allows up to ${limit} ${limitKey.replace('max_', '')}. Upgrade to add more.`, { limitKey, limit, plan: e.plan });
    }
  }
}

