import { OUTBOUND_PUSH_TENANT_INTEGRATION_STATUSES } from '@/lib/integrations/contracts';
import { supabaseAdmin, supabase } from '@/lib/supabase';

export type OutboundTransactionalEntity = 'estimates' | 'orders';

const CAPABILITY_ENTITY: Record<OutboundTransactionalEntity, string> = {
  estimates: 'estimates',
  orders: 'orders',
};

/**
 * Returns true when the tenant has a connected integration whose capabilities
 * include outbound push for the given transactional entity. In that case the
 * buyer app should defer assigning a document number until the push integration
 * completes (or falls back to a provisional number on push failure).
 */
export async function tenantDefersTransactionNumber(
  tenantId: string,
  entityType: OutboundTransactionalEntity,
): Promise<boolean> {
  const db = supabaseAdmin ?? supabase;
  if (!db) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: integrations, error: integrationError } = await (db as any)
    .schema('app')
    .from('tenant_integrations')
    .select('integration_type_id')
    .eq('tenant_id', tenantId)
    .in('status', [...OUTBOUND_PUSH_TENANT_INTEGRATION_STATUSES])
    .is('deleted_at', null);

  if (integrationError || !integrations?.length) return false;

  const typeIds = [...new Set(integrations.map((row: { integration_type_id: string }) => row.integration_type_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: types, error: typeError } = await (db as any)
    .schema('catalog')
    .from('integration_types')
    .select('id, capabilities')
    .in('id', typeIds)
    .eq('is_active', true);

  if (typeError || !types?.length) return false;

  const capabilityKey = CAPABILITY_ENTITY[entityType];
  for (const row of types as Array<{ capabilities?: Record<string, unknown> | null }>) {
    const outbound = row.capabilities?.outbound_transactional;
    if (Array.isArray(outbound) && outbound.includes(capabilityKey)) {
      return true;
    }
  }

  return false;
}
