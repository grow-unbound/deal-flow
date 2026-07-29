/**
 * sync-pricelists — pulls Zoho pricebooks (+ line items) into app.price_lists /
 * app.price_list_items. Orchestrated as part of the integrations-sync →
 * sync-coordinator reference phase group, AND callable independently for
 * one-shot Zoho custom-button / Deluge triggers (same contract as
 * sync-transaction-line-items).
 *
 * Pricelists are special: the list endpoint returns headers only; we must
 * GET /pricebooks/{id} for each pricebook to get line items.
 * fetchPricelists() + fetchPricebookDetail() handle this in the adapter,
 * and persistZohoEntityPage('pricelists') upserts both price_lists and
 * price_list_items.
 *
 * Because pricebooks are few (typically <100) and each detail fetch is a
 * separate API call, we process all of them in a single invocation (no
 * pagination loop needed).
 *
 * Manual / Zoho invocation contract:
 *   - Auth: send `x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET`
 *     whenever that env is configured (same header sync-coordinator already
 *     sends on orchestrated dispatches — orchestrated path is unchanged).
 *   - Omit `job_id` on the call — a standalone job row is created with no
 *     master_job_id (never touched by the reaper/coordinator/cancel RPC),
 *     and its `id` comes back in the response.
 *   - Pass an existing `job_id` only when the coordinator dispatched you
 *     (orchestrated path) — do not invent one from Zoho.
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/sync-pricelists" \
 *     -H "Content-Type: application/json" \
 *     -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \
 *     -d '{"tenant_integration_id":"<uuid>"}'
 *
 *   -- or from SQL (psql / SQL editor):
 *   select net.http_post(
 *     url := app.get_functions_base_url() || '/sync-pricelists',
 *     headers := jsonb_build_object(
 *       'Content-Type', 'application/json',
 *       'x-integrations-dispatch-secret', current_setting('app.integrations_dispatch_secret', true)
 *     ),
 *     body := jsonb_build_object('tenant_integration_id', '<uuid>')
 *   );
 *   -- check progress:
 *   select id, status, records_synced, progress, summary
 *   from app.integration_sync_jobs
 *   where phase = 'pricelists' and master_job_id is null
 *   order by created_at desc limit 1;
 */
import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  assertZohoIntegration,
  updatePhaseJob,
  isSyncJobCancelled,
  getDispatchSecret,
  isAuthorizedInternal,
  jsonResponse,
  errorResponse,
  parseSyncRequest,
  resolvePersistOptionsForJob,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';

const PHASE = 'pricelists';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Standalone (no master_job_id) job for Zoho CTA / manual one-shots.
 * Reaper + coordinator only act on slaves under an active sync_run master,
 * so these rows never enter the orchestrated workflow.
 */
async function createStandalonePricelistJob(
  admin: AdminClient,
  opts: { tenantId: string; tenantIntegrationId: string },
): Promise<string> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      job_type: 'manual',
      run_kind: 'manual_phase',
      phase: PHASE,
      status: 'pending',
      progress: {
        meta: {
          trigger: 'standalone',
          source: 'zoho_or_manual',
        },
      },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Unable to create pricelist sync job: ${error.message}`);
  return data.id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Gate on INTEGRATIONS_DISPATCH_SECRET when configured. Zoho CTA must send
  // `x-integrations-dispatch-secret`; sync-coordinator's dispatchPhase already
  // attaches that header whenever the env is set — orchestrated path unchanged.
  // If the secret env is unset (rare local/dev), skip the gate so we don't
  // brick the integrations-sync workflow while other phase workers remain open.
  if (getDispatchSecret() && !isAuthorizedInternal(req)) {
    return errorResponse('Unauthorized', 401);
  }

  const admin = createAdminClient();
  let jobId: string | null = null;

  try {
    const input = await parseSyncRequest(req);
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
    const adapter = createZohoAdapter(zohoTypeId, credentials);

    // Orchestrated path: coordinator passes the slave job_id it created.
    // Standalone path (Zoho CTA): omit job_id → create a no-master row.
    jobId = input.job_id ?? await createStandalonePricelistJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
    });

    if (await isSyncJobCancelled(admin, jobId)) {
      return jsonResponse({
        ok: false,
        phase: PHASE,
        job_id: jobId,
        records_synced: 0,
        has_more: false,
        next_cursor: null,
        cancelled: true,
      });
    }

    await updatePhaseJob(admin, jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // Fetch all pricebook headers
    const pricebooks = await adapter.fetchPricelists();

    // Wall-clock deadline for persistPricelists' per-pricebook detail-fetch
    // loop (see integrations-persist.ts PersistOptions.deadlineMs) — same
    // 110s budget runPhaseSync uses elsewhere, reserving headroom under the
    // edge function's ~150s hard-kill for this single-invocation phase.
    const deadlineMs = Date.now() + 110_000;

    let totalSynced = 0;
    if (pricebooks.length > 0) {
      const { persistOptions } = await resolvePersistOptionsForJob(admin, jobId, PHASE);
      const result = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        null,
        integration.id,
        PHASE,
        zohoTypeId,
        pricebooks,
        adapter,
        { ...persistOptions, deadlineMs },
      );
      totalSynced = result.created + result.updated;
    }

    if (await isSyncJobCancelled(admin, jobId)) {
      return jsonResponse({
        ok: false,
        phase: PHASE,
        job_id: jobId,
        records_synced: totalSynced,
        has_more: false,
        next_cursor: null,
        cancelled: true,
      });
    }

    await updatePhaseJob(admin, jobId, {
      status: 'completed',
      records_synced: totalSynced,
      completed_at: new Date().toISOString(),
      progress: { pricebooks_fetched: pricebooks.length },
      summary: {
        since: input.since ?? null,
        pricebooks_fetched: pricebooks.length,
        total_processed: totalSynced,
        last_synced_at: new Date().toISOString(),
      },
    });

    return jsonResponse({
      ok: true,
      phase: PHASE,
      job_id: jobId,
      records_synced: totalSynced,
      has_more: false,
      next_cursor: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    console.error('[sync-pricelists]', err);

    if (jobId) {
      await updatePhaseJob(admin, jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
      }).catch(() => {});
    }

    return errorResponse(message);
  }
});
