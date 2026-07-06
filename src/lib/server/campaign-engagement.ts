import type { SupabaseClient } from '@supabase/supabase-js';

export type CampaignViewSource = 'buyer_app' | 'guest_link' | 'cockpit';

function utcViewDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function recordCampaignView(
  db: SupabaseClient,
  input: {
    tenantId: string;
    buyerId: string;
    campaignId: string;
    source: CampaignViewSource;
  },
): Promise<void> {
  const viewedAt = new Date().toISOString();
  const viewDate = utcViewDate();

  const { error } = await db
    .schema('app')
    .from('campaign_views')
    .upsert(
      {
        tenant_id: input.tenantId,
        buyer_id: input.buyerId,
        campaign_id: input.campaignId,
        view_date: viewDate,
        viewed_at: viewedAt,
        source: input.source,
      },
      { onConflict: 'tenant_id,buyer_id,campaign_id,view_date', ignoreDuplicates: false },
    );

  if (error) {
    // Fallback: update viewed_at when upsert shape differs across environments.
    const { error: updateError } = await db
      .schema('app')
      .from('campaign_views')
      .update({ viewed_at: viewedAt, source: input.source, updated_at: viewedAt })
      .eq('tenant_id', input.tenantId)
      .eq('buyer_id', input.buyerId)
      .eq('campaign_id', input.campaignId)
      .eq('view_date', viewDate)
      .is('deleted_at', null);

    if (updateError) {
      console.warn('[recordCampaignView] failed', {
        campaignId: input.campaignId,
        buyerId: input.buyerId,
        message: error.message,
        updateMessage: updateError.message,
      });
    }
  }
}
