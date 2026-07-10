import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const tenantId = process.env.DEBUG_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';

if (!url || !key) {
  throw new Error('Missing Supabase env vars for debug script');
}

const db = createClient(url, key);

const queries = [
  [
    'tenant_brands',
    db
      .schema('app')
      .from('tenant_brands')
      .select(
        'id, tenant_id, master_brand_id, display_name_override, slug, description, logo_url, margin_pct, exclusivity, is_active, external_ref, principal_name, principal_email, principal_phone, principal_location, contact_name, contact_email, contact_phone, default_cohort_id, created_at, updated_at, deleted_at',
      )
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ],
  [
    'brands_snapshot',
    db
      .schema('app')
      .from('brands_snapshot')
      .select('total_count, active_count, with_products_count, refreshed_at')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ],
  [
    'tenant_categories',
    db
      .schema('app')
      .from('tenant_categories')
      .select('id, name, is_active, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ],
  [
    'cohorts',
    db
      .schema('app')
      .from('cohorts')
      .select('id, name, deleted_at, allowed_tenant_brand_ids')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ],
  [
    'buyers',
    db
      .schema('app')
      .from('buyers')
      .select('id, default_cohort_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ],
  ['cohort_members', db.schema('app').from('cohort_members').select('buyer_id, cohort_id')],
  [
    'tenant_products',
    db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, master_product_id, is_active, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null),
  ],
  [
    'tenant_inventory',
    db
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available, reorder_point, location_id')
      .is('deleted_at', null),
  ],
  [
    'current_orders',
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, status')
      .eq('tenant_id', tenantId)
      .gte('order_date', '2026-07-01T00:00:00.000Z')
      .lt('order_date', '2026-08-01T00:00:00.000Z')
      .is('deleted_at', null),
  ],
  [
    'previous_orders',
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, status')
      .eq('tenant_id', tenantId)
      .gte('order_date', '2026-06-01T00:00:00.000Z')
      .lt('order_date', '2026-07-01T00:00:00.000Z')
      .is('deleted_at', null),
  ],
  [
    'current_kpi_brand_daily',
    db
      .schema('app')
      .from('kpi_brand_daily')
      .select('tenant_brand_id, gmv, buyers_count')
      .eq('tenant_id', tenantId)
      .gte('day', '2026-07-01')
      .lt('day', '2026-08-01'),
  ],
  [
    'previous_kpi_brand_daily',
    db
      .schema('app')
      .from('kpi_brand_daily')
      .select('tenant_brand_id, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', '2026-06-01')
      .lt('day', '2026-07-01'),
  ],
  [
    'campaigns',
    db
      .schema('app')
      .from('campaigns')
      .select('id, name, status, updated_at, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null),
  ],
];

for (const [name, promise] of queries) {
  const { error, data } = await promise;
  console.log(
    JSON.stringify({
      name,
      rows: Array.isArray(data) ? data.length : data ? 1 : 0,
      error: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        : null,
    }),
  );
}
