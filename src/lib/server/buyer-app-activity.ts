import type { SupabaseClient } from '@supabase/supabase-js';

export type BuyerAppActivityEvent =
  | 'session_started'
  | 'home_viewed'
  | 'catalog_viewed'
  | 'activity_viewed'
  | 'estimate_created'
  | 'order_created';

interface RecordBuyerAppActivityInput {
  tenantId: string;
  buyerId: string;
  eventName: BuyerAppActivityEvent | string;
  path?: string | null;
  locationId?: string | null;
  idempotencyKey?: string | null;
  qualifiesForEngagement?: boolean;
  context?: Record<string, unknown>;
}

export async function recordBuyerAppActivity(
  db: Pick<SupabaseClient, 'schema'>,
  input: RecordBuyerAppActivityInput,
) {
  const { error } = await db.schema('app').rpc('record_buyer_app_activity', {
    p_tenant_id: input.tenantId,
    p_buyer_id: input.buyerId,
    p_event_name: input.eventName,
    p_location_id: input.locationId ?? null,
    p_metadata: {
      ...(input.context ?? {}),
      path: input.path ?? null,
    },
    p_idempotency_key: input.idempotencyKey ?? null,
    p_qualifies_for_engagement: input.qualifiesForEngagement ?? true,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to record buyer app activity');
  }
}

export async function recordBuyerAppActivitySafe(
  db: Pick<SupabaseClient, 'schema'>,
  input: RecordBuyerAppActivityInput,
) {
  try {
    await recordBuyerAppActivity(db, input);
  } catch (error) {
    console.warn('[buyer-app-activity] record failed', error);
  }
}
