import { describe, expect, it, vi } from 'vitest';

import { batchUpsertLineItems } from '@/lib/server/batch-upsert-line-items';

type Call = { method: string; args: unknown[] };

function createFakeDb() {
  const calls: Call[] = [];

  const chain = {
    schema: vi.fn(() => chain),
    from: vi.fn((table: string) => {
      calls.push({ method: 'from', args: [table] });
      return chain;
    }),
    update: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return chain;
    }),
    upsert: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'upsert', args });
      return Promise.resolve({ error: null });
    }),
    insert: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'insert', args });
      return Promise.resolve({ error: null });
    }),
    in: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'in', args });
      return chain;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return Promise.resolve({ error: null });
    }),
  };

  return { db: chain, calls };
}

describe('batchUpsertLineItems', () => {
  it('issues one batched delete, one batched upsert, one batched insert -- not one call per item', async () => {
    const { db, calls } = createFakeDb();

    const existingItemIds = new Set(['keep-1', 'keep-2', 'stale-1', 'stale-2']);
    const items = [
      { id: 'keep-1', qty: 5 },
      { id: 'keep-2', qty: 7 },
      { qty: 3 }, // new, no id
      { qty: 9 }, // new, no id
    ];

    const result = await batchUpsertLineItems({
      db,
      table: 'estimate_items',
      parentColumn: 'estimate_id',
      parentId: 'doc-1',
      existingItemIds,
      items,
      actorId: 'user-1',
      buildPatch: (item) => ({ qty: item.qty }),
    });

    expect(result.error).toBeNull();

    const deleteCall = calls.find((c) => c.method === 'update' && (c.args[0] as any).deleted_at);
    expect(deleteCall).toBeDefined();
    const staleIdsPassed = calls.find((c) => c.method === 'in')?.args[1];
    expect(new Set(staleIdsPassed as string[])).toEqual(new Set(['stale-1', 'stale-2']));

    const upsertCalls = calls.filter((c) => c.method === 'upsert');
    expect(upsertCalls).toHaveLength(1);
    const upsertRows = upsertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(upsertRows).toHaveLength(2);
    expect(upsertRows.map((r) => r.id).sort()).toEqual(['keep-1', 'keep-2']);
    expect(upsertRows.every((r) => !('created_by' in r))).toBe(true);

    const insertCalls = calls.filter((c) => c.method === 'insert');
    expect(insertCalls).toHaveLength(1);
    const insertRows = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(insertRows).toHaveLength(2);
    expect(insertRows.every((r) => r.created_by === 'user-1')).toBe(true);
    expect(insertRows.every((r) => !('id' in r))).toBe(true);
  });

  it('skips the delete call when there are no stale items', async () => {
    const { db, calls } = createFakeDb();

    await batchUpsertLineItems({
      db,
      table: 'invoice_items',
      parentColumn: 'invoice_id',
      parentId: 'doc-1',
      existingItemIds: new Set(['keep-1']),
      items: [{ id: 'keep-1', qty: 1 }],
      actorId: 'user-1',
      buildPatch: (item) => ({ qty: item.qty }),
    });

    expect(calls.some((c) => c.method === 'in')).toBe(false);
  });

  it('skips the upsert/insert calls when there are no items', async () => {
    const { db, calls } = createFakeDb();

    await batchUpsertLineItems({
      db,
      table: 'order_items',
      parentColumn: 'order_id',
      parentId: 'doc-1',
      existingItemIds: new Set(['stale-1']),
      items: [],
      actorId: 'user-1',
      buildPatch: () => ({}),
    });

    expect(calls.some((c) => c.method === 'upsert')).toBe(false);
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
    expect(calls.some((c) => c.method === 'in')).toBe(true);
  });

  it('surfaces an error from the delete step without attempting update/insert', async () => {
    const { db } = createFakeDb();
    (db.eq as ReturnType<typeof vi.fn>).mockReturnValueOnce(Promise.resolve({ error: { message: 'delete failed' } }));

    const result = await batchUpsertLineItems({
      db,
      table: 'estimate_items',
      parentColumn: 'estimate_id',
      parentId: 'doc-1',
      existingItemIds: new Set(['stale-1']),
      items: [{ qty: 1 }],
      actorId: 'user-1',
      buildPatch: (item) => ({ qty: item.qty }),
    });

    expect(result.error).toEqual({ message: 'delete failed' });
    expect(result.step).toBe('delete');
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
