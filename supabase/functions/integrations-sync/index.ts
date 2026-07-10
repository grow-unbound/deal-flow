/**
 * integrations-sync — Master-slave sync orchestrator.
 *
 * One master job (phase=sync_run) per logical run; slave jobs per entity phase.
 * Self-chains continuations via async POST (no 30s cron resume loop).
 * Does NOT mutate tenant_integrations.status — OAuth stays connected for outbound push.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildContinuationPayload,
  buildSyncRunContext,
  CANONICAL_PHASES,
  dailySinceDateIst,
  deriveRunKind,
  isCanonicalPhase,
  isDegraded,
  isRunKind,
  isRunReadyForAnalysis,
  resolvePhasesToRun,
  resolvePhasesForPolicy,
  resolveFailurePolicyForRunKind,
  resolveRunProfile,
  resolveSyncEnrichmentPolicy,
  shouldHaltOnFailure,
  sinceForPhase,
  type CanonicalPhase,
  type RunKind,
  type SyncRunContext,
} from '../../../src/lib/integrations/sync-orchestration.ts';
import {
  createMasterJob,
  createSlaveJob,
  dispatchPhase,
  findActiveMasterJob,
  getDispatchSecret,
  getFunctionsBaseUrl,
  isPhaseAlreadyComplete,
  isRunAborted,
  loadIntegration,
  loadJob,
  loadSlavesForRun,
  markJobFailed,
  markSlaveSkipped,
  type PhaseResult,
  runAnalysisPhase,
  SyncActiveError,
  type TenantIntegrationRow,
  updateMasterJob,
} from '../_shared/sync-coordinator-actions.ts';

const ORCH_BUDGET_MS = 100_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Await with a 5s abort — ensures the HTTP request is at least sent (TCP
// connection to Supabase established) before the current invocation returns.
// No EdgeRuntime dependency; works at any chain depth including nested waitUntil contexts.
function dispatchContinuation(payload: ReturnType<typeof buildContinuationPayload>): void {
  const secret = getDispatchSecret();
  const p = fetch(`${getFunctionsBaseUrl()}/integrations-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-integrations-dispatch-secret': secret } : {}),
    },
    body: JSON.stringify(payload),
  }).catch((err) => {
    // Network error: the pending slave will be rescued by the reaper after 10 min.
    console.error('[integrations-sync] continuation dispatch failed:', err instanceof Error ? err.message : err);
  });

  // Keep the edge-function runtime alive long enough for the request to be sent.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  runtime?.waitUntil(p);
}

interface OrchestratorState {
  admin: ReturnType<typeof createAdminClient>;
  integration: TenantIntegrationRow;
  ctx: SyncRunContext;
  phasesToRun: readonly CanonicalPhase[];
  forceFullRefresh: boolean;
  orchStart: number;
  results: PhaseResult[];
  startPhaseIndex: number;
  initialSlaveId?: string;
  initialPageFrom?: number | null;
  precreatedJobIds?: Record<string, string>;
}

async function selfChain(
  state: OrchestratorState,
  opts: {
    phase: string;
    pageFrom: number;           // the NEXT slave starts here
    continuationOf: string;     // current slave being finalized
    currentPageFrom?: number;   // where the current slave started (for summary)
    masterStatus?: 'paused' | 'running';
  },
): Promise<Response> {
  const { admin, integration, ctx } = state;

  // Finalize current slave with page-range summary before creating next slave.
  // runPhaseSync already wrote status:'paused' + next_cursor; this adds the summary.
  const slavePageFrom = opts.currentPageFrom ?? 1;
  const slavePageTo = opts.pageFrom - 1; // continuation starts at pageFrom → current ended at pageFrom-1
  await admin.schema('app').from('integration_sync_jobs').update({
    summary: {
      page_from: slavePageFrom,
      page_to: slavePageTo,
      next_page: opts.pageFrom,
      note: `${opts.phase}: pages ${slavePageFrom}–${slavePageTo} processed, continuing from page ${opts.pageFrom}`,
      last_synced_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }).eq('id', opts.continuationOf);

  const nextSlaveId = await createSlaveJob(admin, {
    tenantId: integration.tenant_id,
    tenantIntegrationId: integration.id,
    masterJobId: ctx.masterJobId,
    syncRunId: ctx.syncRunId,
    phase: opts.phase,
    jobType: ctx.jobType,
    triggeredBy: null,
    sinceDate: sinceForPhase(opts.phase, ctx),
    pageFrom: opts.pageFrom,
    continuationOf: opts.continuationOf,
  });

  await updateMasterJob(admin, ctx.masterJobId, {
    status: opts.masterStatus ?? 'paused',
    currentPhase: opts.phase,
    nextPage: opts.pageFrom,
  });

  dispatchContinuation(buildContinuationPayload({
    tenantIntegrationId: integration.id,
    ctx,
    phase: opts.phase,
    pageFrom: opts.pageFrom,
    jobId: nextSlaveId,
  }));

  return json({
    ok: true,
    status: 'paused',
    chained: true,
    master_job_id: ctx.masterJobId,
    sync_run_id: ctx.syncRunId,
    phase: opts.phase,
    job_id: nextSlaveId,
    results: state.results,
  });
}

async function runOrchestratorLoop(state: OrchestratorState): Promise<Response> {
  const { admin, integration, ctx, phasesToRun, forceFullRefresh, orchStart, results } = state;

  let startIndex = state.startPhaseIndex;
  let bootstrapSlaveId = state.initialSlaveId;
  let bootstrapPageFrom = state.initialPageFrom;

  for (let phaseIndex = startIndex; phaseIndex < phasesToRun.length; phaseIndex++) {
    const phase = phasesToRun[phaseIndex];

    if (await isRunAborted(admin, ctx.masterJobId)) {
      return json({ ok: false, status: 'aborted', master_job_id: ctx.masterJobId, results });
    }

    let slaveId = bootstrapSlaveId ?? state.precreatedJobIds?.[phase];
    bootstrapSlaveId = undefined;

    if (!slaveId) {
      slaveId = await createSlaveJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        masterJobId: ctx.masterJobId,
        syncRunId: ctx.syncRunId,
        phase,
        jobType: ctx.jobType,
        triggeredBy: null,
        sinceDate: sinceForPhase(phase, ctx),
      });
    }

    if (!forceFullRefresh && await isPhaseAlreadyComplete(admin, {
      tenantIntegrationId: integration.id,
      phase,
      excludeJobId: slaveId,
      masterJobId: ctx.masterJobId,
    })) {
      await markSlaveSkipped(admin, slaveId, phase);
      results.push({ ok: true, phase, records_synced: 0, has_more: false, next_cursor: null });
      continue;
    }

    const pageFrom = bootstrapPageFrom ?? 1;
    bootstrapPageFrom = null;

    await updateMasterJob(admin, ctx.masterJobId, {
      status: 'running',
      currentPhase: phase,
      nextPage: pageFrom,
      startedAt: phaseIndex === startIndex ? new Date().toISOString() : undefined,
    });

    try {
      const result = await dispatchPhase({
        phase,
        tenantIntegrationId: integration.id,
        jobId: slaveId,
        pageFrom,
        since: sinceForPhase(phase, ctx),
      });
      results.push(result);

      if (await isRunAborted(admin, ctx.masterJobId)) {
        return json({ ok: false, status: 'cancelled', master_job_id: ctx.masterJobId, results });
      }

      if (result.has_more) {
        const nextPage = (result.next_cursor as { page?: number } | null)?.page ?? pageFrom + 1;
        return selfChain(state, { phase, pageFrom: nextPage, continuationOf: slaveId, currentPageFrom: pageFrom });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await markJobFailed(admin, slaveId, message);

      if (shouldHaltOnFailure(phase, ctx)) {
        await updateMasterJob(admin, ctx.masterJobId, {
          status: 'failed',
          runHalted: true,
          completedAt: new Date().toISOString(),
        });
        return json({
          ok: false,
          status: 'halted',
          failed_at: phase,
          error: message,
          master_job_id: ctx.masterJobId,
          results,
        }, 500);
      }
      // Skip failed transactional (or incremental reference) phase and continue
      continue;
    }

    if (Date.now() - orchStart > ORCH_BUDGET_MS) {
      const nextPhase = phasesToRun[phaseIndex + 1];
      if (nextPhase) {
        const nextSlaveId = state.precreatedJobIds?.[nextPhase] ?? await createSlaveJob(admin, {
          tenantId: integration.tenant_id,
          tenantIntegrationId: integration.id,
          masterJobId: ctx.masterJobId,
          syncRunId: ctx.syncRunId,
          phase: nextPhase,
          jobType: ctx.jobType,
          triggeredBy: null,
          sinceDate: sinceForPhase(nextPhase, ctx),
          pageFrom: 1,
        });
        await updateMasterJob(admin, ctx.masterJobId, { status: 'paused', currentPhase: nextPhase, nextPage: 1 });
        dispatchContinuation(buildContinuationPayload({
          tenantIntegrationId: integration.id,
          ctx,
          phase: nextPhase,
          pageFrom: 1,
          jobId: nextSlaveId,
        }));
        return json({
          ok: true,
          status: 'paused',
          chained: true,
          budget_handoff: true,
          master_job_id: ctx.masterJobId,
          results,
        });
      }
    }
  }

  const slaves = await loadSlavesForRun(admin, ctx.syncRunId);
  const phasesInRun = (await loadJob(admin, ctx.masterJobId))?.progress?.phases_in_run as string[] | undefined
    ?? [...phasesToRun];

  if (isRunReadyForAnalysis(slaves, phasesInRun)) {
    await runAnalysisPhase(admin, integration, ctx, null);
  }

  await updateMasterJob(admin, ctx.masterJobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    degraded: isDegraded(results),
    summary: {
      phases_run: results.map((r) => r.phase),
      phases_failed: results.filter((r) => !r.ok).map((r) => r.phase),
      total_records_synced: results.reduce((n, r) => n + r.records_synced, 0),
      last_synced_at: new Date().toISOString(),
    },
  });

  return json({
    ok: true,
    status: 'complete',
    master_job_id: ctx.masterJobId,
    sync_run_id: ctx.syncRunId,
    results,
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
    if (!tenantIntegrationId) return json({ ok: false, error: 'tenant_integration_id is required' }, 400);

    const isContinuation = body.continuation === true;
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

    // ── Continuation path ──────────────────────────────────────────────────
    if (isContinuation) {
      const masterJobId = typeof body.master_job_id === 'string' ? body.master_job_id : null;
      const slaveJobId = typeof body.job_id === 'string' ? body.job_id : null;
      const phase = typeof body.phase === 'string' ? body.phase : null;
      const pageFrom = typeof body.page_from === 'number' ? body.page_from : 1;

      if (!masterJobId || !slaveJobId || !phase) {
        return json({ ok: false, error: 'continuation requires master_job_id, job_id, phase' }, 400);
      }

      if (await isRunAborted(admin, masterJobId)) {
        return json({ ok: false, status: 'aborted', master_job_id: masterJobId });
      }

      const master = await loadJob(admin, masterJobId);
      if (!master) return json({ ok: false, error: 'Master job not found' }, 404);

      const progress = master.progress ?? {};
      const profile = resolveRunProfile({ forceFullRefresh: false, jobType, isContinuation: true });
      // run_kind was fixed at master-job creation — read it back rather than
      // re-deriving, so a continuation's failure policy always matches the
      // policy the run actually started with.
      const runKind = isRunKind(master.run_kind)
        ? master.run_kind
        : deriveRunKind({ jobType: master.job_type ?? jobType, requestedPhase: null });
      const ctx = buildSyncRunContext({
        masterJobId,
        profile,
        runKind,
        jobType: master.job_type ?? jobType,
        transactionSince: typeof progress.transaction_since === 'string' ? progress.transaction_since : master.since_date,
        referenceSince: typeof progress.reference_since === 'string' ? progress.reference_since : null,
      });

      const phasesInRun = Array.isArray(progress.phases_in_run)
        ? progress.phases_in_run.filter(isCanonicalPhase)
        : [...CANONICAL_PHASES];

      const phaseIndex = phasesInRun.indexOf(phase as CanonicalPhase);
      if (phaseIndex < 0) return json({ ok: false, error: `Phase ${phase} not in run` }, 400);

      return runOrchestratorLoop({
        admin,
        integration,
        ctx,
        phasesToRun: phasesInRun,
        forceFullRefresh: progress.run_profile === 'full_refresh',
        orchStart: Date.now(),
        results: [],
        startPhaseIndex: phaseIndex,
        initialSlaveId: slaveJobId,
        initialPageFrom: pageFrom,
      });
    }

    // ── New run path ───────────────────────────────────────────────────────
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

    const ctx = buildSyncRunContext({
      masterJobId,
      profile,
      runKind,
      jobType,
      transactionSince,
      referenceSince,
    });

    await updateMasterJob(admin, masterJobId, { status: 'running', startedAt: new Date().toISOString() });

    const precreatedJobIds: Record<string, string> = {};
    for (const phase of phasesToRun) {
      precreatedJobIds[phase] = await createSlaveJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        masterJobId,
        syncRunId: masterJobId,
        phase,
        jobType,
        triggeredBy: actorUserId,
        sinceDate: sinceForPhase(phase, ctx),
      });
    }

    return runOrchestratorLoop({
      admin,
      integration,
      ctx,
      phasesToRun,
      forceFullRefresh,
      orchStart: Date.now(),
      results: [],
      startPhaseIndex: 0,
      precreatedJobIds,
    });
  } catch (err) {
    if (err instanceof SyncActiveError) {
      return json({ ok: false, error: 'Sync already in progress', code: 'SYNC_ACTIVE' }, 409);
    }
    console.error('[integrations-sync]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Sync failed' }, 500);
  }
});
