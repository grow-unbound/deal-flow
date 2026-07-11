import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// Fetches /contacts → persists app.buyers + app.buyer_users (embedded
// contact_persons) + app.price_list_assignments. Must run AFTER
// sync-pricelists. Contact persons for ALL contacts (not just the ones
// embedded in the list response) are a separate orchestrated phase —
// see sync-contact-persons/index.ts.
const CONTACTS_PHASE = {
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

    const result = await runPhaseSync(admin, integration, credentials, CONTACTS_PHASE, {
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
