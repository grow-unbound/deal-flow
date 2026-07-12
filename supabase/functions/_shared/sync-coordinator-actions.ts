/**
 * Shared job-row CRUD + phase-dispatch helpers for the sync orchestrator.
 * Used by both integrations-sync (starts a run) and sync-coordinator
 * (advances an existing run). Extracted so the two edge functions don't
 * maintain two copies of the same row-shape/dispatch logic — that kind of
 * drift is exactly what produced the master_job_id JSONB-vs-column bugs
 * this orchestrator redesign is fixing.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ACTIVE_MASTER_STATUSES,
  ANALYSIS_PHASE,
  buildSyncRunContext,
  CANONICAL_PHASES,
  decideCircuitBreaker,
  decideRevival,
  deriveRunKind,
  isCanonicalPhase,
  isMasterRunActive,
  isRunKind,
  MASTER_PHASE,
  MAX_REVIVAL_ATTEMPTS,
  type RevivalDecision,
  type RunKind,
  type RunProfile,
  type SyncRunContext,
} from '../../../src/lib/integrations/sync-orchestration.ts';

// A concretely-instantiated local factory, not the bare generic export —
// `ReturnType<typeof createClient>` alone resolves .schema()'s parameter to
// `never` since the generic isn't inferred from a call site. Every edge
// function's own local createAdminClient() (same call shape) structurally
// matches this, so passing their client instances here type-checks fine.
function createAdminClientForTyping() {
  return createClient('', '', { auth: { persistSession: false, autoRefreshToken: false } });
}
export type AdminClient = ReturnType<typeof createAdminClientForTyping>;

export function getFunctionsBaseUrl(): string {
  const configured = Deno.env.get('INTEGRATIONS_FUNCTIONS_BASE_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  return (configured ?? `${supabaseUrl}/functions/v1`).replace(/\/+$/, '');
}

export function getDispatchSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_DISPATCH_SECRET') ?? null;
}

export interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  status: string;
}

export interface JobRow {
  id: string;
  tenant_id: string;
  tenant_integration_id: string;
  phase: string | null;
  status: string;
  progress: Record<string, unknown> | null;
  since_date: string | null;
  job_type: string;
  run_kind: string | null;
  heartbeat_at?: string | null;
  attempt_count?: number | null;
  records_synced?: number | null;
}

export async function loadIntegration(
  admin: AdminClient,
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

export async function loadJob(admin: AdminClient, jobId: string): Promise<JobRow | null> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, tenant_id, tenant_integration_id, phase, status, progress, since_date, job_type, run_kind')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load job: ${error.message}`);
  return data as JobRow | null;
}

export async function findActiveMasterJob(
  admin: AdminClient,
  tenantIntegrationId: string,
): Promise<JobRow | null> {
  // Check for active sync_run master
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, tenant_id, tenant_integration_id, phase, status, progress, since_date, job_type, run_kind')
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

  // Also block when an async repair job is pending/running for this integration
  const { data: repairData, error: repairError } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, tenant_id, tenant_integration_id, phase, status, progress, since_date, job_type, run_kind')
    .eq('tenant_integration_id', tenantIntegrationId)
    .eq('phase', 'repair_aggregates')
    .in('status', ['pending', 'running'])
    .is('deleted_at', null)
    .limit(1);

  if (repairError) throw new Error(`Failed to query active repair: ${repairError.message}`);
  if (repairData && repairData.length > 0) {
    throw new SyncActiveError('A repair job is currently in progress. Wait for it to finish before starting a sync.');
  }

  return null;
}

// Thrown when the DB's partial unique index (one active master per
// tenant_integration_id) rejects a concurrent duplicate run — see migration
// add_unique_active_master_run. Callers translate this to a SYNC_ACTIVE 409,
// closing the TOCTOU race between findActiveMasterJob and this INSERT.
export class SyncActiveError extends Error {}

export async function createMasterJob(
  admin: AdminClient,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    jobType: string;
    runKind: RunKind;
    triggeredBy: string | null;
    transactionSince: string | null;
    referenceSince: string | null;
    profile: RunProfile;
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
    run_kind: opts.runKind,
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
  if (error) {
    if (error.code === '23505') throw new SyncActiveError('Sync already in progress');
    throw new Error(`Failed to create master job: ${error.message}`);
  }
  return masterId;
}

export async function createSlaveJob(
  admin: AdminClient,
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

// The new-run path precreates one slave row per phase in phasesToRun up
// front, but each phase transition after the first happens inside a FRESH
// invocation reconstructed from the continuation HTTP payload — which never
// carried the full precreatedJobIds map forward, only the id of the phase
// being resumed. Without this DB lookup, finishOrAdvance's in-memory
// `state.precreatedJobIds?.[nextPhase]` is always undefined for any phase
// beyond the first, so it unconditionally created a brand-new slave row —
// permanently orphaning the originally precreated 'pending' row for that
// phase (nothing ever dispatches it, so it just sits until the reaper burns
// through 3 revival attempts and permanently fails it with "reaped:
// exceeded revival cap", sometimes taking the whole master down with it via
// the halt-on-permanent-failure check, even though the REAL work for that
// phase completed fine through the replacement row). Checking the DB first
// finds and reuses the original precreated row regardless of how many
// continuation hops separate this call from the run's initial invocation.
export async function findPendingSlaveForPhase(
  admin: AdminClient,
  masterJobId: string,
  phase: string,
): Promise<string | null> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id')
    .eq('master_job_id', masterJobId)
    .eq('phase', phase)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up pending slave for phase ${phase}: ${error.message}`);
  return data?.id ?? null;
}

export async function updateMasterJob(
  admin: AdminClient,
  masterJobId: string,
  patch: {
    status?: string;
    currentPhase?: string | null;
    nextPage?: number | null;
    runHalted?: boolean;
    degraded?: boolean;
    startedAt?: string;
    completedAt?: string;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  const existing = await loadJob(admin, masterJobId);
  const progress = { ...(existing?.progress ?? {}) } as Record<string, unknown>;
  if (patch.currentPhase !== undefined) progress.current_phase = patch.currentPhase;
  if (patch.nextPage !== undefined) progress.next_page = patch.nextPage;
  if (patch.runHalted === true || patch.degraded !== undefined) {
    const meta = typeof progress.meta === 'object' && progress.meta !== null
      ? { ...(progress.meta as Record<string, unknown>) }
      : {};
    if (patch.runHalted === true) meta.run_halted = true;
    // Run completed but at least one phase was skipped due to failure — never
    // silently report plain 'completed' when that happened; status stays
    // 'completed' (avoids widening the status CHECK constraint) but this
    // flag surfaces a "completed with issues" badge in Settings.
    if (patch.degraded !== undefined) meta.degraded = patch.degraded;
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

export async function isRunAborted(admin: AdminClient, masterJobId: string): Promise<boolean> {
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

export async function loadSlavesForRun(admin: AdminClient, syncRunId: string): Promise<JobRow[]> {
  // Uses the real master_job_id column (added in migration add_master_job_id_to_sync_jobs).
  // The old .contains('progress', { meta: { sync_run_id } }) query breaks after the first
  // updatePhaseJob call strips progress.meta via full JSONB replace.
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, tenant_id, tenant_integration_id, phase, status, progress, since_date, job_type, run_kind, heartbeat_at, attempt_count, records_synced')
    .eq('master_job_id', syncRunId)
    .neq('phase', MASTER_PHASE)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load slaves for run: ${error.message}`);
  return (data ?? []) as JobRow[];
}

export async function markJobFailed(admin: AdminClient, jobId: string, message: string): Promise<void> {
  await admin.schema('app').from('integration_sync_jobs').update({
    status: 'failed',
    error_log: { message, timestamp: new Date().toISOString() },
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

export async function markSlaveSkipped(admin: AdminClient, jobId: string, phase: string): Promise<void> {
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

export interface PhaseResult {
  ok: boolean;
  phase: string;
  records_synced: number;
  has_more: boolean;
  next_cursor: Record<string, unknown> | null;
}

// Above each callee's own ~110s soft budget + handover-write window (so a
// normal completion is never cut off early), and ~10s under the platform's
// ~150s hard kill (so the orchestrator itself still gets to record a clean
// failure instead of being silently platform-killed — replaces the
// status_code:546/~152s incidents this caused).
const DISPATCH_TIMEOUT_MS = 140_000;

// Phases whose deployed function name isn't the literal `sync-${phase}`
// template (phase ids use underscores; these two functions' names use
// hyphens instead).
const PHASE_FUNCTION_NAMES: Record<string, string> = {
  transaction_line_items: 'sync-transaction-line-items',
  contact_persons: 'sync-contact-persons',
};

export async function dispatchPhase(opts: {
  phase: string;
  tenantIntegrationId: string;
  jobId: string;
  pageFrom?: number | null;
  since?: string | null;
}): Promise<PhaseResult> {
  const functionName = PHASE_FUNCTION_NAMES[opts.phase] ?? `sync-${opts.phase}`;
  const url = `${getFunctionsBaseUrl()}/${functionName}`;
  const secret = getDispatchSecret();

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`${functionName} dispatch timed out after ${DISPATCH_TIMEOUT_MS}ms`)),
    DISPATCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
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
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({ ok: false, error: 'Invalid JSON response' })) as Record<string, unknown>;

  if (!response.ok || data.ok === false) {
    throw new Error(
      (data.error as string | undefined) ?? `sync-${opts.phase} returned ${response.status}`,
    );
  }

  return data as unknown as PhaseResult;
}

export async function isPhaseAlreadyComplete(
  admin: AdminClient,
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

export async function runAnalysisPhase(
  admin: AdminClient,
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
    await admin.schema('app').rpc('post_sync_rebuild', {
      p_tenant_id: integration.tenant_id,
      p_days: isInitialSync ? 90 : 2,
    });

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

/**
 * Reconstructs a SyncRunContext from a persisted master row's own progress —
 * used anywhere a run needs to resume/advance without the original request
 * body (continuation handling, coordinator ticks). run_kind is read back
 * rather than re-derived so failure policy always matches what the run
 * actually started with.
 */
export function buildRunContextFromMaster(master: JobRow, fallbackJobType: string): SyncRunContext {
  const progress = master.progress ?? {};
  const runKind = isRunKind(master.run_kind)
    ? master.run_kind
    : deriveRunKind({ jobType: master.job_type ?? fallbackJobType, requestedPhase: null });
  const profile: RunProfile = progress.run_profile === 'full_refresh' ? 'full_refresh' : 'pickup';
  return buildSyncRunContext({
    masterJobId: master.id,
    profile,
    runKind,
    jobType: master.job_type ?? fallbackJobType,
    transactionSince: typeof progress.transaction_since === 'string' ? progress.transaction_since : master.since_date,
    referenceSince: typeof progress.reference_since === 'string' ? progress.reference_since : null,
  });
}

export function phasesInRunFromMaster(master: JobRow): readonly string[] {
  const progress = master.progress ?? {};
  return Array.isArray(progress.phases_in_run)
    ? progress.phases_in_run.filter(isCanonicalPhase)
    : [...CANONICAL_PHASES];
}

/**
 * Bounded revival for a stale slave — see decideRevival for the cap/backoff
 * policy. 'revive' resets the slave to 'pending' (the next coordinator tick
 * redispatches it once next_retry_eligible_at has passed); 'permanently_fail'
 * marks it terminally failed so the normal halt/skip failure-policy handling
 * in decideCoordinatorAction takes over on the next tick — no separate
 * "was this permanently failed" branch needed there.
 */
export async function reviveOrFailSlave(
  admin: AdminClient,
  jobId: string,
  currentAttemptCount: number,
): Promise<RevivalDecision> {
  const decision = decideRevival({ currentAttemptCount });
  const now = new Date().toISOString();

  if (decision.type === 'revive') {
    await admin.schema('app').from('integration_sync_jobs').update({
      status: 'pending',
      attempt_count: decision.nextAttemptCount,
      next_retry_eligible_at: decision.nextRetryEligibleAt,
      updated_at: now,
    }).eq('id', jobId);
  } else {
    await admin.schema('app').from('integration_sync_jobs').update({
      status: 'failed',
      attempt_count: decision.nextAttemptCount,
      completed_at: now,
      updated_at: now,
      error_log: {
        message: `Permanently failed after ${MAX_REVIVAL_ATTEMPTS} revival attempts — stalled with no heartbeat progress. Requires manual retry via app.retry_sync_phase.`,
        timestamp: now,
      },
    }).eq('id', jobId);
  }

  return decision;
}

/**
 * Circuit breaker: after CIRCUIT_BREAKER_FAILURE_THRESHOLD consecutive
 * fully-failed runs for one tenant integration, suspend further automatic
 * (cron-triggered) syncs until a human acknowledges. Manual syncs from
 * Settings remain allowed throughout — only run_zoho_orchestrator_cron's
 * dispatch predicate checks sync_suspended.
 */
export async function updateCircuitBreakerState(
  admin: AdminClient,
  tenantIntegrationId: string,
  runOutcome: 'failed' | 'completed' | 'degraded',
): Promise<void> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('consecutive_run_failures')
    .eq('id', tenantIntegrationId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load circuit breaker state: ${error.message}`);

  const current = (data as { consecutive_run_failures: number } | null)?.consecutive_run_failures ?? 0;
  const update = decideCircuitBreaker({ consecutiveRunFailures: current, runOutcome });
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { consecutive_run_failures: update.consecutiveRunFailures };
  if (update.shouldSuspend) {
    patch.sync_suspended = true;
    patch.sync_suspended_reason = `${update.consecutiveRunFailures} consecutive sync runs failed`;
    patch.sync_suspended_at = now;
  }

  await admin.schema('app').from('tenant_integrations').update(patch).eq('id', tenantIntegrationId);
}
