import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { maybeContext } from './context';
import { PrismaService, Tx } from './prisma.service';

const SENSITIVE = /pass|token|secret|card|authorization|cookie/i;

/** Drop sensitive keys and truncate long strings before persisting audit metadata. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return value.length > 500 ? value.slice(0, 500) + '…' : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Prisma.Decimal.isDecimal(value)) return value.toString();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  tenantId?: string | null;
  actorId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}

  /** Record inside the caller's transaction so the event commits atomically with the change. */
  async recordTx(tx: Tx, e: AuditInput) {
    const ctx = maybeContext();
    await tx.auditEvent.create({
      data: {
        tenantId: e.tenantId !== undefined ? e.tenantId : ctx?.tenantId ?? null,
        actorId: e.actorId !== undefined ? e.actorId : ctx?.userId ?? null,
        impersonatorId: ctx?.impersonatorId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        correlationId: ctx?.correlationId,
        ip: ctx?.ip ?? null,
        metadata: e.metadata === undefined ? undefined : (sanitize(e.metadata) as Prisma.InputJsonValue),
      },
    });
  }

  /** Record outside any business transaction (e.g. failed logins, tenant-less events). */
  record(e: AuditInput) {
    return this.db.run((tx) => this.recordTx(tx, e), { platform: true });
  }
}
