import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  jsonResponse,
  errorResponse,
  getFunctionsBaseUrl,
  getDispatchSecret,
  upsertPhaseJob,
  resolveSyncImportActorId,
} from '../_shared/sync-utils.ts';

// Step 1: fetch /contacts → persist app.buyers + app.buyer_users (embedded contact_persons)
//         + app.price_list_assignments. Must run AFTER sync-pricelists.
// Step 2: fetch /contacts/contactpersons → persist app.buyer_users for ALL contact persons.
//         Fires as a self-dispatched continuation after contacts complete, using
//         the same pages/budget/chaining/summary pattern.
const CONTACTS_PHASE = {
  id: 'customers',
  label: 'Importing customers from Zoho',
  entityType: 'customers',
  path: '/contacts',
  itemKey: 'contacts',
} as const;

const CONTACT_PERSONS_PHASE = {
  id: 'contact_persons',
  label: 'Importing contact persons from Zoho',
  entityType: 'contact_persons',
  path: '/contacts/contactpersons',
  itemKey: 'contact_persons',
} as const;

function scheduleBackground(promise: Promise<unknown>): void {
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  const task = promise.catch((err) => {
    console.error('[sync-customers] background dispatch failed:', err);
  });
  edgeRuntime?.waitUntil(task);
}

async function dispatchContactPersonsStep(
  tenantIntegrationId: string,
  jobId: string,
  since: string | null,
  pageFrom?: number | null,
): Promise<void> {
  const base = getFunctionsBaseUrl();
  const secret = getDispatchSecret();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-integrations-dispatch-secret'] = secret;

  await fetch(`${base}/sync-customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      step: 'contact_persons',
      tenant_integration_id: tenantIntegrationId,
      job_id: jobId,
      since,
      ...(pageFrom != null && pageFrom > 1 ? { page_from: pageFrom } : {}),
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const tenantIntegrationId = typeof body.tenant_integration_id === 'string'
      ? body.tenant_integration_id
      : null;
    if (!tenantIntegrationId) return errorResponse('tenant_integration_id is required');

    const step = typeof body.step === 'string' ? body.step : 'contacts';
    const jobId = typeof body.job_id === 'string' ? body.job_id : null;
    const pageFrom = typeof body.page_from === 'number' ? body.page_from : null;
    const perPage = typeof body.per_page === 'number' ? body.per_page : null;
    const since = typeof body.since === 'string' ? body.since : null;

    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, tenantIntegrationId);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);

    // ── Step: contact_persons (self-dispatched continuation) ─────────────────
    if (step === 'contact_persons') {
      const result = await runPhaseSync(admin, integration, credentials, CONTACT_PERSONS_PHASE, {
        jobId,
        pageFrom,
        perPage,
        since,
      });

      // More pages — self-chain to continue the contact_persons sweep
      if (result.has_more && result.next_cursor && jobId) {
        const nextPage = (result.next_cursor as { page?: number }).page ?? null;
        scheduleBackground(dispatchContactPersonsStep(tenantIntegrationId, jobId, since, nextPage));
      }

      return jsonResponse(result);
    }

    // ── Step: contacts (default — dispatched by integrations-sync orchestrator) ─
    const result = await runPhaseSync(admin, integration, credentials, CONTACTS_PHASE, {
      jobId,
      pageFrom,
      perPage,
      since,
    });

    // Orchestrator re-dispatches when has_more — only kick off contact_persons
    // once all contacts pages are done.
    if (!result.has_more) {
      // Inherit job_type from the contacts slave job so the new slave is consistent
      let jobType = 'manual';
      if (jobId) {
        const { data: jobRow } = await admin
          .schema('app')
          .from('integration_sync_jobs')
          .select('job_type')
          .eq('id', jobId)
          .maybeSingle();
        if (typeof jobRow?.job_type === 'string') jobType = jobRow.job_type;
      }

      const actorId = resolveSyncImportActorId(integration);
      const cpJobId = await upsertPhaseJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        phase: 'contact_persons',
        jobType,
        triggeredBy: actorId,
        sinceDate: since,
      });

      scheduleBackground(dispatchContactPersonsStep(tenantIntegrationId, cpJobId, since));
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('[sync-customers]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
