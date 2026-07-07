import type { SupabaseClient } from '@supabase/supabase-js';
import { appendFileSync } from 'node:fs';

export type CampaignViewSource = 'buyer_app' | 'guest_link' | 'cockpit';

const DEBUG_LOG_PATH = '/Users/phanikrovvidi/projects/deal-flow/.cursor/debug-3ff3b0.log';

function agentDebugLog(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ sessionId: '3ff3b0', timestamp: Date.now(), ...payload });
  // #region agent log
  fetch('http://127.0.0.1:7499/ingest/42159701-4a5a-4229-9bc0-a9348f871657', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3ff3b0' },
    body: line,
  }).catch(() => {});
  if (process.env.NODE_ENV === 'development') {
    try {
      appendFileSync(DEBUG_LOG_PATH, `${line}\n`);
    } catch {
      // ignore local log failures
    }
  }
  // #endregion
}

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

  // #region agent log
  agentDebugLog({
    location: 'campaign-engagement.ts:recordCampaignView:entry',
    message: 'recordCampaignView called',
    data: { campaignId: input.campaignId, buyerId: input.buyerId, source: input.source, viewDate },
    hypothesisId: 'A',
  });
  // #endregion

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
    // #region agent log
    agentDebugLog({
      location: 'campaign-engagement.ts:recordCampaignView:update-error',
      message: 'campaign view update failed',
      data: { campaignId: input.campaignId, message: updateError.message },
      hypothesisId: 'A',
    });
    // #endregion
    console.warn('[recordCampaignView] update failed', {
      campaignId: input.campaignId,
      buyerId: input.buyerId,
      message: updateError.message,
    });
    return;
  }

  if ((updatedRows ?? []).length > 0) {
    // #region agent log
    agentDebugLog({
      location: 'campaign-engagement.ts:recordCampaignView:updated',
      message: 'campaign view updated',
      data: { campaignId: input.campaignId, rowCount: (updatedRows ?? []).length },
      hypothesisId: 'A',
    });
    // #endregion
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
    // #region agent log
    agentDebugLog({
      location: 'campaign-engagement.ts:recordCampaignView:insert-error',
      message: 'campaign view insert failed',
      data: { campaignId: input.campaignId, message: insertError.message, code: insertError.code },
      hypothesisId: 'A',
    });
    // #endregion
    console.warn('[recordCampaignView] insert failed', {
      campaignId: input.campaignId,
      buyerId: input.buyerId,
      message: insertError.message,
    });
    return;
  }

  // #region agent log
  agentDebugLog({
    location: 'campaign-engagement.ts:recordCampaignView:inserted',
    message: 'campaign view inserted',
    data: { campaignId: input.campaignId, buyerId: input.buyerId },
    hypothesisId: 'A',
  });
  // #endregion
}
