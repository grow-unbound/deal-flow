import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

// customer_payments phase: fetches /customerpayments filtered by date_start (payment date).
// List pass: persists app.payments headers.
// Detail pass (inside persistCustomerPayments): fetches /customerpayments/{id} per payment
// to get invoices[] and upserts app.payment_applications.
const PHASE = {
  id: 'customer_payments',
  label: 'Importing customer payments from Zoho',
  entityType: 'customer_payments',
  path: '/customerpayments',
  itemKey: 'customerpayments',
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
    console.error('[sync-customer-payments]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
