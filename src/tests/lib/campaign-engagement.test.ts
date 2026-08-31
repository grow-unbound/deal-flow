import { describe, expect, it, vi } from 'vitest';

import { recordCampaignView } from '@/lib/server/campaign-engagement';

function createMockDb(rpcError: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  const schema = vi.fn(() => ({ rpc }));

  return {
    db: { schema } as unknown as Parameters<typeof recordCampaignView>[0],
    schema,
    rpc,
  };
}

describe('recordCampaignView', () => {
  it('calls the app.record_campaign_view upsert RPC with the right params', async () => {
    const { db, schema, rpc } = createMockDb();

    await recordCampaignView(db, {
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      campaignId: 'campaign-1',
      source: 'buyer_app',
    });

    expect(schema).toHaveBeenCalledWith('app');
    expect(rpc).toHaveBeenCalledWith('record_campaign_view', {
      p_tenant_id: 'tenant-1',
      p_buyer_id: 'buyer-1',
      p_campaign_id: 'campaign-1',
      p_source: 'buyer_app',
    });
  });

  it('does not throw when the RPC errors', async () => {
    const { db } = createMockDb({ message: 'duplicate key value violates unique constraint' });

    await expect(
      recordCampaignView(db, {
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        campaignId: 'campaign-1',
        source: 'buyer_app',
      }),
    ).resolves.toBeUndefined();
  });
});
