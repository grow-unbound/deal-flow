import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// Invoices phase: fetches /invoices filtered to Indian Financial Year start.
// Persists app.invoices + app.invoice_items.
const PHASE = {
  id: 'invoices',
  label: 'Importing invoices from Zoho',
  entityType: 'invoices',
  path: '/invoices',
  itemKey: 'invoices',
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
    console.error('[sync-invoices]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
