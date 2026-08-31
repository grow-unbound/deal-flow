import type { SupabaseClient } from '@supabase/supabase-js';

export type CampaignViewSource = 'buyer_app' | 'guest_link' | 'cockpit';

export async function recordCampaignView(
  db: SupabaseClient,
  input: {
    tenantId: string;
    buyerId: string;
    campaignId: string;
    source: CampaignViewSource;
  },
): Promise<void> {
  // app.record_campaign_view does a real INSERT ... ON CONFLICT (...) WHERE
  // deleted_at IS NULL DO UPDATE — atomic against concurrent requests for the
  // same buyer/campaign/day. PostgREST's .upsert() can't target the partial
  // unique index directly, so this goes through a DB function instead of the
  // client (see migration 20260831013151 for why the old update-then-insert
  // approach raced under concurrent calls).
  const { error } = await db.schema('app').rpc('record_campaign_view', {
    p_tenant_id: input.tenantId,
    p_buyer_id: input.buyerId,
    p_campaign_id: input.campaignId,
    p_source: input.source,
  });

  if (error) {
    console.warn('[recordCampaignView] upsert failed', {
      campaignId: input.campaignId,
      buyerId: input.buyerId,
      message: error.message,
    });
  }
}
