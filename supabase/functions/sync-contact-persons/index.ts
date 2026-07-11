/**
 * sync-contact-persons — fetches /contacts/contactpersons, persists
 * app.buyer_users for all contact persons. Runs as its own orchestrated
 * reference phase, right after `customers` (needs contacts already synced).
 *
 * Previously a bespoke self-dispatched sub-step of sync-customers
 * (dispatchContactPersonsStep/scheduleBackground), with its own job rows
 * that never set master_job_id — invisible to the reaper, the coordinator,
 * and the cancel RPC, so a stalled run here had no recovery path. Now a
 * plain phase worker like every other sync-{phase} function: sync-coordinator
 * creates and dispatches its slave row the same way it does for every
 * other phase, and runPhaseSync's budget/heartbeat/resume handling applies.
 */
import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';

const CONTACT_PERSONS_PHASE = {
  id: 'contact_persons',
  label: 'Importing contact persons from Zoho',
  entityType: 'contact_persons',
  path: '/contacts/contactpersons',
  itemKey: 'contact_persons',
} as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);

    const result = await runPhaseSync(admin, integration, credentials, CONTACT_PERSONS_PHASE, {
      jobId: input.job_id,
      pageFrom: input.page_from,
      perPage: input.per_page,
      since: input.since,
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('[sync-contact-persons]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
