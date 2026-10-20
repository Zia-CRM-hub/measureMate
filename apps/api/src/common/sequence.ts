import { Tx } from './prisma.service';

/** Atomically allocate the next gap-free number for a per-tenant sequence (row lock via upsert). */
export async function nextSeq(tx: Tx, tenantId: string, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO sequences ("tenantId", key, value) VALUES (${tenantId}::uuid, ${key}, 1)
    ON CONFLICT ("tenantId", key) DO UPDATE SET value = sequences.value + 1
    RETURNING value`;
  return rows[0]!.value;
}

export async function nextNumber(tx: Tx, tenantId: string, key: string, prefix: string, pad = 5): Promise<string> {
  const n = await nextSeq(tx, tenantId, key);
  return `${prefix}${String(n).padStart(pad, '0')}`;
}
