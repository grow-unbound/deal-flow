import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// Products phase: fetches /items and persists tenant_products, tenant_brands,
// tenant_categories, and tenant_inventory (item_locations/warehouses[] inline).
const PHASE = {
  id: 'products',
  label: 'Importing products from Zoho',
  entityType: 'products',
  path: '/items',
  itemKey: 'items',
} as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);

    const result = await runPhaseSync(admin, integration, credentials, PHASE, {
      jobId: input.job_id,
      pageFrom: input.page_from,
      perPage: input.per_page,
      since: input.since,
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('[sync-products]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
