/**
 * integrations-sync — Master-slave sync orchestrator.
 *
 * One master job (phase=sync_run) per logical run; slave jobs per entity phase.
 * Self-chains continuations via async POST (no 30s cron resume loop).
 * Does NOT mutate tenant_integrations.status — OAuth stays connected for outbound push.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ACTIVE_MASTER_STATUSES,
  ANALYSIS_PHASE,
  buildContinuationPayload,
  buildSyncRunContext,
  CANONICAL_PHASES,
  dailySinceDateIst,
  getMasterJobIdFromProgress,
  getSyncRunIdFromProgress,
  isCanonicalPhase,
  isMasterRunActive,
  isRunReadyForAnalysis,
  MASTER_PHASE,
  resolvePhasesToRun,
  resolvePhasesForPolicy,
  resolveRunProfile,
  resolveSyncEnrichmentPolicy,
  shouldHaltOnFailure,
  sinceForPhase,
  type CanonicalPhase,
  type SyncRunContext,
} from '../../../src/lib/integrations/sync-orchestration.ts';

const ORCH_BUDGET_MS = 100_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getFunctionsBaseUrl(): string {
  const configured = Deno.env.get('INTEGRATIONS_FUNCTIONS_BASE_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  return (configured ?? `${supabaseUrl}/functions/v1`).replace(/\/+$/, '');
}

function getDispatchSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_DISPATCH_SECRET') ?? null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}


interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  status: string;
}

interface JobRow {
  id: string;
  phase: string | null;
  status: string;
  progress: Record<string, unknown> | null;
  since_date: string | null;
  job_type: string;
}

async function loadIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, status')
    .eq('id', tenantIntegrationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load integration: ${error.message}`);
  if (!data) throw new Error('Tenant integration not found');
  return data as TenantIntegrationRow;
}

async function loadJob(admin: ReturnType<typeof createAdminClient>, jobId: string): Promise<JobRow | null> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, phase, status, progress, since_date, job_type')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load job: ${error.message}`);
  return data as JobRow | null;
}

async function findActiveMasterJob(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<JobRow | null> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, phase, status, progress, since_date, job_type')
    .eq('tenant_integration_id', tenantIntegrationId)
    .eq('phase', MASTER_PHASE)
    .in('status', [...ACTIVE_MASTER_STATUSES])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw new Error(`Failed to query active master: ${error.message}`);
  for (const row of data ?? []) {
    if (isMasterRunActive(row as JobRow)) return row as JobRow;
  }
  return null;
}

async function createMasterJob(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    jobType: string;
    triggeredBy: string | null;
    transactionSince: string | null;
    referenceSince: string | null;
    profile: ReturnType<typeof resolveRunProfile>;
    failurePolicy: SyncRunContext['failurePolicy'];
    phasesInRun: readonly string[];
  },
): Promise<string> {
  const masterId = crypto.randomUUID();
  const { error } = await admin.schema('app').from('integration_sync_jobs').insert({
    id: masterId,
    tenant_id: opts.tenantId,
    tenant_integration_id: opts.tenantIntegrationId,
    job_type: opts.jobType,
    phase: MASTER_PHASE,
    status: 'pending',
    since_date: opts.transactionSince,
    progress: {
      current_phase: opts.phasesInRun[0] ?? null,
      next_page: 1,
      run_profile: opts.profile,
      failure_policy: opts.failurePolicy,
      transaction_since: opts.transactionSince,
      reference_since: opts.referenceSince,
      phases_in_run: opts.phasesInRun,
      sync_run_id: masterId,
      meta: {
        sync_run_id: masterId,
        run_cancelled: false,
        run_halted: false,
      },
    },
    triggered_by: opts.triggeredBy,
    created_by: opts.triggeredBy,
    updated_by: opts.triggeredBy,
  });
  if (error) throw new Error(`Failed to create master job: ${error.message}`);
  return masterId;
}

async function createSlaveJob(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    masterJobId: string;
    syncRunId: string;
    phase: string;
    jobType: string;
    triggeredBy: string | null;
    sinceDate: string | null;
    pageFrom?: number;
    continuationOf?: string | null;
    status?: string;
  },
): Promise<string> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      master_job_id: opts.masterJobId,
      job_type: opts.jobType,
      phase: opts.phase,
      status: opts.status ?? 'pending',
      since_date: opts.sinceDate,
      progress: {
        meta: {
          sync_run_id: opts.syncRunId,
          master_job_id: opts.masterJobId,
          continuation_of: opts.continuationOf ?? null,
          page_from: opts.pageFrom ?? 1,
        },
      },
      triggered_by: opts.triggeredBy,
      created_by: opts.triggeredBy,
      updated_by: opts.triggeredBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create slave job: ${error.message}`);
  return data.id as string;
}

async function updateMasterJob(
  admin: ReturnType<typeof createAdminClient>,
  masterJobId: string,
  patch: {
    status?: string;
    currentPhase?: string | null;
    nextPage?: number | null;
    runHalted?: boolean;
    startedAt?: string;
    completedAt?: string;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  const existing = await loadJob(admin, masterJobId);
  const progress = { ...(existing?.progress ?? {}) };
  if (patch.currentPhase !== undefined) progress.current_phase = patch.currentPhase;
  if (patch.nextPage !== undefined) progress.next_page = patch.nextPage;
  if (patch.runHalted === true) {
    const meta = typeof progress.meta === 'object' && progress.meta !== null
      ? { ...(progress.meta as Record<string, unknown>) }
      : {};
    meta.run_halted = true;
    progress.meta = meta;
  }

  const update: Record<string, unknown> = {
    progress,
    updated_at: new Date().toISOString(),
  };
  if (patch.status) update.status = patch.status;
  if (patch.startedAt) update.started_at = patch.startedAt;
  if (patch.completedAt) update.completed_at = patch.completedAt;
  if (patch.summary) update.summary = patch.summary;

  await admin.schema('app').from('integration_sync_jobs').update(update).eq('id', masterJobId);
}

async function isRunAborted(admin: ReturnType<typeof createAdminClient>, masterJobId: string): Promise<boolean> {
  const master = await loadJob(admin, masterJobId);
  if (!master) return true;
  if (master.status === 'cancelled' || master.status === 'failed') return true;
  const meta = master.progress?.meta;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (m.run_cancelled === true || m.run_halted === true) return true;
  }
  return false;
}

async function loadSlavesForRun(
  admin: ReturnType<typeof createAdminClient>,
  syncRunId: string,
): Promise<JobRow[]> {
  // Uses the real master_job_id column (added in migration add_master_job_id_to_sync_jobs).
  // The old .contains('progress', { meta: { sync_run_id } }) query breaks after the first
  // updatePhaseJob call strips progress.meta via full JSONB replace.
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, phase, status, progress, since_date, job_type')
    .eq('master_job_id', syncRunId)
    .neq('phase', MASTER_PHASE)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load slaves for run: ${error.message}`);
  return (data ?? []) as JobRow[];
}

async function markJobFailed(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  message: string,
): Promise<void> {
  await admin.schema('app').from('integration_sync_jobs').update({
    status: 'failed',
    error_log: { message, timestamp: new Date().toISOString() },
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

async function markSlaveSkipped(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  phase: string,
): Promise<void> {
  const now = new Date().toISOString();
  await admin.schema('app').from('integration_sync_jobs').update({
    status: 'completed',
    completed_at: now,
    updated_at: now,
    progress: {
      phase,
      phase_label: 'Skipped — already up to date',
      note: 'Skipped: previous sync already completed this phase.',
    },
  }).eq('id', jobId);
}

// ── Phase dispatch ───────────────────────────────────────────────────────────

interface PhaseResult {
  ok: boolean;
  phase: string;
  records_synced: number;
  has_more: boolean;
  next_cursor: Record<string, unknown> | null;
}

async function dispatchPhase(opts: {
  phase: string;
  tenantIntegrationId: string;
  jobId: string;
  pageFrom?: number | null;
  since?: string | null;
}): Promise<PhaseResult> {
  const functionName = opts.phase === 'transaction_line_items'
    ? 'sync-transaction-line-items'
    : `sync-${opts.phase}`;
  const url = `${getFunctionsBaseUrl()}/${functionName}`;
  const secret = getDispatchSecret();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-integrations-dispatch-secret': secret } : {}),
    },
    body: JSON.stringify({
      tenant_integration_id: opts.tenantIntegrationId,
      job_id: opts.jobId,
      page_from: opts.pageFrom ?? 1,
      since: opts.since ?? null,
    }),
  });

  const data = await response.json().catch(() => ({ ok: false, error: 'Invalid JSON response' })) as Record<string, unknown>;

  if (!response.ok || data.ok === false) {
    throw new Error(
      (data.error as string | undefined) ?? `sync-${opts.phase} returned ${response.status}`,
    );
  }

  return data as unknown as PhaseResult;
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

async function isPhaseAlreadyComplete(
  admin: ReturnType<typeof createAdminClient>,
  opts: { tenantIntegrationId: string; phase: string; excludeJobId: string; masterJobId: string },
): Promise<boolean> {
  const { data } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('status')
    .eq('tenant_integration_id', opts.tenantIntegrationId)
    .eq('master_job_id', opts.masterJobId)
    .eq('phase', opts.phase)
    .neq('id', opts.excludeJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.status === 'completed';
}

async function runAnalysisPhase(
  admin: ReturnType<typeof createAdminClient>,
  integration: TenantIntegrationRow,
  ctx: SyncRunContext,
  actorUserId: string | null,
): Promise<void> {
  const analysisJobId = await createSlaveJob(admin, {
    tenantId: integration.tenant_id,
    tenantIntegrationId: integration.id,
    masterJobId: ctx.masterJobId,
    syncRunId: ctx.syncRunId,
    phase: ANALYSIS_PHASE,
    jobType: ctx.jobType,
    triggeredBy: actorUserId,
    sinceDate: ctx.transactionSince,
    status: 'running',
  });

  await admin.schema('app').from('integration_sync_jobs').update({
    started_at: new Date().toISOString(),
    progress: {
      phase_label: 'Rebuilding snapshots and KPI…',
      meta: { sync_run_id: ctx.syncRunId, master_job_id: ctx.masterJobId },
    },
  }).eq('id', analysisJobId);

  const isInitialSync = ctx.jobType === 'initial_reference' || ctx.jobType === 'initial_transactional';

  try {
    if (isInitialSync) {
      await admin.schema('app').rpc('post_sync_rebuild', {
        p_tenant_id: integration.tenant_id,
        p_days: 90,
      });
    } else {
      await admin.schema('app').rpc('post_sync_rebuild', {
        p_tenant_id: integration.tenant_id,
        p_days: 2,
      });
    }

    const analysisCompletedAt = new Date().toISOString();
    await admin.schema('app').from('integration_sync_jobs').update({
      status: 'completed',
      completed_at: analysisCompletedAt,
      updated_at: analysisCompletedAt,
      progress: {
        phase_label: 'Snapshots and KPI ready.',
        meta: { sync_run_id: ctx.syncRunId, master_job_id: ctx.masterJobId },
      },
      summary: {
        last_synced_at: analysisCompletedAt,
        note: `Snapshots and KPIs rebuilt${isInitialSync ? ' (full, 90 days)' : ' (incremental, 2 days)'}`,
      },
    }).eq('id', analysisJobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await admin.schema('app').from('integration_sync_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress: { phase_label: `Snapshot rebuild failed: ${message}` },
      error_log: { message, timestamp: new Date().toISOString() },
    }).eq('id', analysisJobId);
  }
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
      const ctx = buildSyncRunContext({
        masterJobId,
        profile,
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

    const masterJobId = await createMasterJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
      jobType,
      triggeredBy: actorUserId,
      transactionSince,
      referenceSince,
      profile,
      failurePolicy: profile === 'full_refresh' ? 'halt_on_reference_failure' : 'skip_failed_phases',
      phasesInRun: phasesToRun,
    });

    const ctx = buildSyncRunContext({
      masterJobId,
      profile,
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
    console.error('[integrations-sync]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Sync failed' }, 500);
  }
});
