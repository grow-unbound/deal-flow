import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// Estimates phase: fetches /estimates filtered to Indian Financial Year start
// (handled inside fetchPhasePage via financialYearStart() in integrations-zoho.ts).
// Persists app.estimates + app.estimate_items (line items in list payload).
const PHASE = {
  id: 'estimates',
  label: 'Importing estimates from Zoho',
  entityType: 'estimates',
  path: '/estimates',
  itemKey: 'estimates',
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
    console.error('[sync-estimates]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
