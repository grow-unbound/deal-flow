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

  // Partial unique index (deleted_at IS NULL) is not usable with PostgREST upsert — update-then-insert instead.
  const { data: updatedRows, error: updateError } = await db
    .schema('app')
    .from('campaign_views')
    .update({ viewed_at: viewedAt, source: input.source, updated_at: viewedAt })
    .eq('tenant_id', input.tenantId)
    .eq('buyer_id', input.buyerId)
    .eq('campaign_id', input.campaignId)
    .eq('view_date', viewDate)
    .is('deleted_at', null)
    .select('id');

  if (updateError) {
    console.warn('[recordCampaignView] update failed', {
      campaignId: input.campaignId,
      buyerId: input.buyerId,
      message: updateError.message,
    });
    return;
  }

  if ((updatedRows ?? []).length > 0) {
    return;
  }

  const { error: insertError } = await db
    .schema('app')
    .from('campaign_views')
    .insert({
      tenant_id: input.tenantId,
      buyer_id: input.buyerId,
      campaign_id: input.campaignId,
      view_date: viewDate,
      viewed_at: viewedAt,
      source: input.source,
    });

  if (insertError) {
    console.warn('[recordCampaignView] insert failed', {
      campaignId: input.campaignId,
      buyerId: input.buyerId,
      message: insertError.message,
    });
  }
}
