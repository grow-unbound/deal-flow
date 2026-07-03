import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

const LOCATIONS_PHASE = {
  id: 'locations',
  label: 'Importing locations from Zoho',
  entityType: 'locations',
  path: '/locations',
  itemKey: 'locations',
} as const;

const WAREHOUSES_PHASE = {
  id: 'warehouses',
  label: 'Importing warehouses from Zoho',
  entityType: 'warehouses',
  path: '/settings/warehouses',
  itemKey: 'warehouses',
} as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);

    const syncOpts = {
      jobId: input.job_id,
      pageFrom: input.page_from,
      perPage: input.per_page,
      since: input.since,
    };

    if (integration.integration_type_id === 'zoho_books') {
      // Zoho Books: locations (transaction-level) then inventory warehouses
      // Warehouses must come after locations so their location_id FK can be resolved
      const locResult = await runPhaseSync(admin, integration, credentials, LOCATIONS_PHASE, syncOpts);
      const whResult = await runPhaseSync(admin, integration, credentials, WAREHOUSES_PHASE, {
        perPage: syncOpts.perPage,
        since: syncOpts.since,
      });
      return jsonResponse({
        ...locResult,
        phase: 'locations+warehouses',
        records_synced: locResult.records_synced + whResult.records_synced,
      });
    }

    // Zoho Inventory: warehouses ARE the canonical concept (no separate locations endpoint)
    const result = await runPhaseSync(admin, integration, credentials, WAREHOUSES_PHASE, syncOpts);
    return jsonResponse(result);
  } catch (err) {
    console.error('[sync-locations]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
