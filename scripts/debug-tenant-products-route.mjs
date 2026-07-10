import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const tenantId = process.env.DEBUG_TENANT_ID ?? '588d3b1b-86d6-49be-a18d-a280b9c76430';

if (!url || !key) {
  throw new Error('Missing Supabase env vars for debug script');
}

const db = createClient(url, key);

async function run() {
  // 1. Non-assistant path: loadTenantInventoryForTenant equivalent
  const nonAssistantRes = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available, tenant_products!inner(tenant_id)')
    .eq('tenant_products.tenant_id', tenantId)
    .is('deleted_at', null);

  console.log(
    'non_assistant_tenant_inventory:',
    JSON.stringify({
      rows: nonAssistantRes.data ? nonAssistantRes.data.length : 0,
      error: nonAssistantRes.error ?? null,
    }),
  );

  // 2. Assistant path: resolve assistantLocationIds -> assistantWarehouseIds -> tenant_inventory scoped query
  // Grab some real location ids for this tenant to exercise the resolution step meaningfully.
  const locationsRes = await db
    .schema('app')
    .from('warehouses')
    .select('id, location_id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(5);

  console.log(
    'warehouses_sample:',
    JSON.stringify({ rows: locationsRes.data ?? [], error: locationsRes.error ?? null }),
  );

  const assistantLocationIds = (locationsRes.data ?? [])
    .map((w) => w.location_id)
    .filter(Boolean);

  const warehousesRes = await db
    .schema('app')
    .from('warehouses')
    .select('id')
    .in('location_id', assistantLocationIds.length > 0 ? assistantLocationIds : ['00000000-0000-0000-0000-000000000000'])
    .is('deleted_at', null);

  console.log(
    'assistant_warehouse_resolution:',
    JSON.stringify({
      rows: warehousesRes.data ? warehousesRes.data.length : 0,
      error: warehousesRes.error ?? null,
    }),
  );

  const assistantWarehouseIds = (warehousesRes.data ?? []).map((row) => row.id);

  const scopedInventoryRes = assistantWarehouseIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available, warehouse_id')
        .in('warehouse_id', assistantWarehouseIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  console.log(
    'assistant_scoped_tenant_inventory:',
    JSON.stringify({
      rows: scopedInventoryRes.data ? scopedInventoryRes.data.length : 0,
      error: scopedInventoryRes.error ?? null,
    }),
  );
}

run();
