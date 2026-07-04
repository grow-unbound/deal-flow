/**
 * WhatsApp Broadcast Phase E — audience targeting dispatcher.
 *
 * Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.4, §4.5, §7.2.
 *
 * Thin TS wrapper around the six `app.resolve_broadcast_audience_*` RPCs
 * (20260704090620_add_whatsapp_broadcasts.sql). Every RPC already hard-filters
 * `deleted_at`/`whatsapp_opt_out_at` — this wrapper doesn't re-filter, it just
 * dispatches by `target_type` and returns a flat buyer_id[] so both the
 * audience-preview route and the broadcast-create route share one code path
 * (no risk of preview count and actually-stored recipient count diverging).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppBroadcastTargetType } from '@/lib/zod';

export type TargetType = WhatsAppBroadcastTargetType;

export interface ResolveAudienceInput {
  tenantId: string;
  targetType: TargetType;
  targetCohortId?: string | null;
  targetFilter?: Record<string, string | number> | null;
  targetBuyerIds?: string[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/**
 * Resolves the eligible buyer_id[] for a given targeting mode. Throws on
 * RPC error (caller decides how to surface it) rather than swallowing —
 * unlike ledger writes, an audience-resolution failure must block the
 * broadcast from being created with a wrong/empty count.
 */
export async function resolveBroadcastAudience(
  db: AnyDb,
  input: ResolveAudienceInput,
): Promise<string[]> {
  const supa = db as SupabaseClient;
  let rpcName: string;
  let rpcArgs: Record<string, unknown>;

  switch (input.targetType) {
    case 'cohort':
      if (!input.targetCohortId) throw new Error('target_cohort_id required for cohort targeting');
      rpcName = 'resolve_broadcast_audience_cohort';
      rpcArgs = { p_tenant_id: input.tenantId, p_cohort_id: input.targetCohortId };
      break;
    case 'buyer_selection':
      rpcName = 'resolve_broadcast_audience_buyer_selection';
      rpcArgs = { p_tenant_id: input.tenantId, p_buyer_ids: input.targetBuyerIds ?? [] };
      break;
    case 'geography_filter':
      rpcName = 'resolve_broadcast_audience_geography';
      rpcArgs = { p_tenant_id: input.tenantId, p_filter: input.targetFilter ?? {} };
      break;
    case 'dormant_filter':
      rpcName = 'resolve_broadcast_audience_dormant';
      rpcArgs = { p_tenant_id: input.tenantId, p_filter: input.targetFilter ?? { dormant_days_gt: 45 } };
      break;
    case 'dues_filter':
      rpcName = 'resolve_broadcast_audience_dues';
      rpcArgs = { p_tenant_id: input.tenantId, p_filter: input.targetFilter ?? null };
      break;
    case 'all_buyers':
      rpcName = 'resolve_broadcast_audience_all';
      rpcArgs = { p_tenant_id: input.tenantId };
      break;
    default:
      throw new Error(`Unknown target_type: ${input.targetType}`);
  }

  const { data, error } = await supa.schema('app').rpc(rpcName, rpcArgs);
  if (error) {
    throw new Error(`Failed to resolve broadcast audience (${rpcName}): ${error.message}`);
  }

  return ((data ?? []) as Array<{ buyer_id: string }>).map((row) => row.buyer_id);
}
