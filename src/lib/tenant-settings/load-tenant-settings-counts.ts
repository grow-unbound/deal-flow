import type { SupabaseClient } from '@/lib/supabase';
import type { TenantOpenCounts, TenantUsageCounts } from '@/lib/tenant-settings/build-module-settings-view';

export async function loadTenantSettingsCounts(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ usage: TenantUsageCounts; open_counts: TenantOpenCounts }> {
  const [
    { count: cohorts, error: e1 },
    { count: priceListCount, error: e2 },
    { count: catalogs, error: e3 },
    { count: enquiries, error: e4 },
    { count: sales_orders, error: e5 },
    { count: invoices, error: e6 },
  ] = await Promise.all([
    db.schema('app').from('cohorts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null),
    db
      .schema('app')
      .from('price_lists')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('published_catalogs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('status', 'in', '("converted","invoiced","void","declined","expired")'),
    db
      .schema('app')
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('status', 'in', '("delivered","cancelled")'),
    db
      .schema('app')
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('status', 'in', '("paid","void")'),
  ]);

  for (const [err, label] of [
    [e1, 'cohorts'],
    [e2, 'price_lists'],
    [e3, 'published_catalogs'],
    [e4, 'estimates'],
    [e5, 'orders'],
    [e6, 'invoices'],
  ] as const) {
    if (err) console.error(`[loadTenantSettingsCounts] ${label}`, err);
  }

  return {
    usage: {
      cohorts: cohorts ?? 0,
      price_lists: priceListCount ?? 0,
      catalogs: catalogs ?? 0,
    },
    open_counts: {
      enquiries: enquiries ?? 0,
      sales_orders: sales_orders ?? 0,
      invoices: invoices ?? 0,
    },
  };
}
