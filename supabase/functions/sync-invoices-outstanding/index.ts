import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// invoices_outstanding phase: re-fetches all currently open invoices from Zoho
// regardless of last_modified_time. Runs after the regular invoices phase in
// the daily incremental to catch invoices whose balances changed due to payment
// application (Zoho does not update invoice.last_modified_time on payment).
// Uses entityType 'invoices_outstanding' so TRANSACTIONAL_ENTITY_TYPES does not
// apply — no date_start filter is added; filter_by=Status.Outstanding is the
// sole filter, returning all open/partially-paid invoices.
const PHASE = {
  id: 'invoices_outstanding',
  label: 'Re-fetching outstanding invoices from Zoho',
  entityType: 'invoices_outstanding',
  path: '/invoices',
  itemKey: 'invoices',
  extraParams: { filter_by: 'Status.Outstanding' },
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
    console.error('[sync-invoices-outstanding]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
