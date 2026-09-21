import { describe, expect, it, vi } from 'vitest';
import { applyEstimateLinePrices, syncInboxEntryForEstimate } from '@/lib/server/estimate-convert-support';

function fakeDb(unpriced: string[]) {
  const updates: Array<{ id: string; unit_price: number }> = [];
  const db = {
    schema: () => ({
      from: () => {
        let pendingUpdate: { unit_price: number } | null = null;
        let eqId: string | null = null;
        const q: any = {
          update: (v: { unit_price: number }) => { pendingUpdate = v; return q; },
          select: () => q,
          eq: (col: string, val: string) => { if (col === 'id') eqId = val; return q; },
          is: () => q,
          in: () => q,
          then: (resolve: (v: unknown) => unknown) => {
            if (pendingUpdate && eqId) updates.push({ id: eqId, unit_price: pendingUpdate.unit_price });
            return Promise.resolve({ data: pendingUpdate ? null : unpriced.map((id) => ({ id })), error: null }).then(resolve);
          },
        };
        return q;
      },
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
  return { db, updates };
}

describe('applyEstimateLinePrices', () => {
  it('writes overrides onto the estimate lines and passes when nothing is left unpriced', async () => {
    const { db, updates } = fakeDb([]);
    expect(await applyEstimateLinePrices(db, 'est', ['l1'], { l1: 120 })).toBeNull();
    expect(updates).toEqual([{ id: 'l1', unit_price: 120 }]);
  });

  it('rejects when a converted line still has no price', async () => {
    const { db } = fakeDb(['l2']);
    expect(await applyEstimateLinePrices(db, 'est', ['l2'], undefined)).toMatch(/Price required/);
  });
});

describe('syncInboxEntryForEstimate', () => {
  it('never throws when the sync RPC fails', async () => {
    const db = { schema: () => ({ rpc: vi.fn().mockRejectedValue(new Error('boom')) }) };
    await expect(syncInboxEntryForEstimate(db, 'est')).resolves.toBeUndefined();
  });
});
