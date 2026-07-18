/**
 * integrations-sync — creates a sync run and returns immediately.
 *
 * Creates only the master job (phase=sync_run). No slave rows are
 * precreated here — app.tick_sync_coordinator's 15s cron tick invokes
 * sync-coordinator, whose dispatch_next_phase action creates each phase's
 * slave row lazily, one at a time, right before dispatching it (see
 * sync-coordinator/index.ts). sync-coordinator is the sole driver of "what
 * happens next" for every master/slave transition. Phase workers
 * (sync-{phase}) only ever write their own terminal state and return.
 *
 * This function used to precreate every phase's slave row up front. That
 * was safe as long as exactly one actor ever dispatched them — but while
 * this function's old self-chain and sync-coordinator's tick were both
 * live at once (two uncoordinated drivers racing to advance the same run),
 * precreation gave them something to race OVER: whichever actor lost the
 * race to flip a precreated row out of 'pending' would find nothing and
 * create a duplicate, orphaning the original until the reaper permanently
 * failed it and halted the whole run. Self-chain is gone now, but
 * precreation was still unnecessary surface area even with a single
 * writer — removed. With no precreation there's nothing left to race over.
 *
 * Does NOT mutate tenant_integrations.status — OAuth stays connected for outbound push.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  dailySinceDateIst,
  deriveRunKind,
  isRunKind,
  resolveFailurePolicyForRunKind,
  resolvePhasesForPolicy,
  resolveRunProfile,
  resolveSyncEnrichmentPolicy,
  type CanonicalPhase,
  type RunKind,
} from '../../../src/lib/integrations/sync-orchestration.ts';
import {
  createMasterJob,
  findActiveMasterJob,
  loadIntegration,
  SyncActiveError,
  updateMasterJob,
} from '../_shared/sync-coordinator-actions.ts';

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
    if (!tenantIntegrationId) return json({ ok: false, error: 'tenant_integration_id is required' }, 400);

    const jobType = typeof body.job_type === 'string' ? body.job_type : 'manual';
    const forceFullRefresh = body.force_full_refresh === true;
    const sinceInput = typeof body.since === 'string' ? body.since : null;

    const authHeader = req.headers.get('Authorization');
    let actorUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          authHeader.replace('Bearer ', ''),
        );
        const { data: { user } } = await supabase.auth.getUser();
        actorUserId = user?.id ?? null;
      } catch { /* ignore */ }
    }

    const admin = createAdminClient();
    const integration = await loadIntegration(admin, tenantIntegrationId);

    const activeMaster = await findActiveMasterJob(admin, tenantIntegrationId);
    if (activeMaster) {
      return json({ ok: false, error: 'Sync already in progress', code: 'SYNC_ACTIVE' }, 409);
    }

    const requestedPhaseRaw = typeof body.phase === 'string' ? body.phase : null;
    const enrichmentPolicy = resolveSyncEnrichmentPolicy(jobType);
    const phasesToRun = resolvePhasesForPolicy({
      requestedPhase: requestedPhaseRaw,
      enrichmentPolicy,
    }) as CanonicalPhase[];

    const transactionSince = forceFullRefresh
      ? sinceInput
      : (sinceInput ?? (jobType === 'incremental' ? dailySinceDateIst() : null));
    const referenceSince = forceFullRefresh ? null : (jobType === 'incremental' ? dailySinceDateIst() : null);

    const profile = resolveRunProfile({ forceFullRefresh, jobType, isContinuation: false });

    const requestedRunKind = typeof body.run_kind === 'string' ? body.run_kind : null;
    let runKind: RunKind;
    if (isRunKind(requestedRunKind)) {
      runKind = requestedRunKind;
    } else {
      runKind = deriveRunKind({ jobType, requestedPhase: requestedPhaseRaw });
      // A live signal that a caller wasn't updated to send run_kind explicitly.
      console.warn(`[integrations-sync] run_kind not provided, derived '${runKind}' from job_type='${jobType}'`);
    }

    // Best-effort: drop sync-heavy tables from supabase_realtime for the
    // run's duration (see app.pause_sync_realtime — the WAL-decode consumer
    // was the single biggest cumulative DB cost during a bulk sync). Failure
    // here must not block the sync itself; sync-coordinator resumes it on
    // every terminal path (mark_complete/halt_failed) regardless.
    try {
      await admin.schema('app').rpc('pause_sync_realtime');
    } catch (err) {
      console.warn('[integrations-sync] pause_sync_realtime failed, continuing without it:', err);
    }

    const masterJobId = await createMasterJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
      jobType,
      runKind,
      triggeredBy: actorUserId,
      transactionSince,
      referenceSince,
      profile,
      failurePolicy: resolveFailurePolicyForRunKind(runKind),
      phasesInRun: phasesToRun,
    });

    // 'running' (not 'pending') so tick_sync_coordinator's own query
    // (WHERE status IN ('running','paused')) picks this master up on its
    // next tick — within 15s.
    await updateMasterJob(admin, masterJobId, { status: 'running', startedAt: new Date().toISOString() });

    // Best-effort immediate kick so phase 1 doesn't wait up to 15s for the
    // next cron tick. Safe to call directly (not a second race) because
    // tick_sync_coordinator() itself does the FOR UPDATE SKIP LOCKED
    // lease-grab — this just makes this invocation compete for the same
    // SQL-level lease the cron-triggered call would, instead of bypassing
    // it. Failure here is harmless; the 15s cron backstop covers it.
    try {
      await admin.schema('app').rpc('tick_sync_coordinator');
    } catch (err) {
      console.warn('[integrations-sync] immediate coordinator kick failed, cron will pick it up within 15s:', err);
    }

    return json({
      ok: true,
      status: 'queued',
      master_job_id: masterJobId,
      sync_run_id: masterJobId,
      results: [],
    });
  } catch (err) {
    if (err instanceof SyncActiveError) {
      return json({ ok: false, error: 'Sync already in progress', code: 'SYNC_ACTIVE' }, 409);
    }
    console.error('[integrations-sync]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Sync failed' }, 500);
  }
});
