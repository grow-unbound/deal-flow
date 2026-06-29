import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

const PHASE = {
  id: 'locations',
  label: 'Importing locations from Zoho',
  entityType: 'locations',
  path: '/locations',
  itemKey: 'locations',
} as const;

// Inventory uses /warehouses instead of /locations
const INVENTORY_PHASE = {
  ...PHASE,
  path: '/warehouses',
  itemKey: 'warehouses',
  label: 'Importing warehouses from Zoho',
} as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);

    const phase = integration.integration_type_id === 'zoho_inventory' ? INVENTORY_PHASE : PHASE;

    const result = await runPhaseSync(admin, integration, credentials, phase, {
      jobId: input.job_id,
      pageFrom: input.page_from,
      perPage: input.per_page,
      since: input.since,
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('[sync-locations]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
