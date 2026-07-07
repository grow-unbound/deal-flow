import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordCampaignView } from '@/lib/server/campaign-engagement';

function createMockDb(handlers: {
  updateResult?: { data: Array<{ id: string }> | null; error: { message: string } | null };
  insertError?: { message: string; code?: string } | null;
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(handlers.updateResult ?? { data: [], error: null }),
  });
  const insert = vi.fn().mockResolvedValue({ error: handlers.insertError ?? null });

  const from = vi.fn((table: string) => {
    expect(table).toBe('campaign_views');
    return { update, insert };
  });

  return {
    db: {
      schema: vi.fn(() => ({ from })),
    } as unknown as Parameters<typeof recordCampaignView>[0],
    update,
    insert,
  };
}

describe('recordCampaignView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('inserts when no existing row for today', async () => {
    const { db, insert } = createMockDb({ updateResult: { data: [], error: null } });

    await recordCampaignView(db, {
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      campaignId: 'campaign-1',
      source: 'buyer_app',
    });

    expect(insert).toHaveBeenCalledOnce();
  });

  it('skips insert when update hits an existing row', async () => {
    const { db, insert } = createMockDb({
      updateResult: { data: [{ id: 'view-1' }], error: null },
    });

    await recordCampaignView(db, {
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      campaignId: 'campaign-1',
      source: 'buyer_app',
    });

    expect(insert).not.toHaveBeenCalled();
  });
});
