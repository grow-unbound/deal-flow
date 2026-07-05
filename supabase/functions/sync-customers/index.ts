import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// Customers phase: fetches /contacts and persists:
//   - app.buyers (one row per Zoho contact)
//   - app.buyer_users (contact_persons — embedded or fetched via /contactpersons)
//   - app.price_list_assignments (pricebook_id on contact → buyer-level assignment)
//
// Must run AFTER sync-pricelists so pricebook FK exists when assignments are written.
const PHASE = {
  id: 'customers',
  label: 'Importing customers from Zoho',
  entityType: 'customers',
  path: '/contacts',
  itemKey: 'contacts',
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
    console.error('[sync-customers]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
