/**
 * sync-coordinator — Phase 2 of the sync orchestration redesign.
 *
 * The only thing that decides "what happens next" for a sync run. Phase
 * workers (sync-{phase}) only ever write their own terminal state and
 * return; they never dispatch another job (that used to be selfChain's job
 * inside integrations-sync/index.ts — see that file's header). Every tick
 * reads fresh DB state and decides exactly one next action, which makes each
 * tick idempotent: a lost or duplicate tick just re-derives the same
 * decision from the same state, no "did I already fire" bookkeeping needed.
 *
 * LIVE-FLIP GATE: controlled by the SYNC_COORDINATOR_LIVE env var, default
 * unset/false = shadow mode (decide + record progress.meta.shadow_decision,
 * dispatch nothing). Set to 'true' only after shadow-mode decisions have
 * been verified against real production run snapshots (see the sync
 * orchestration redesign plan's Phase 2 rollout step) — this lets ops flip
 * the switch without a redeploy, and flip it back instantly if something
 * looks wrong.
 *
 * Bounded revival (attempt_count / exponential backoff) and the circuit
 * breaker (consecutive_run_failures / sync_suspended) are wired in — see
 * decideRevival/decideCircuitBreaker in sync-orchestration.ts for the pure
 * policy, and reviveOrFailSlave/updateCircuitBreakerState in
 * sync-coordinator-actions.ts for the persistence.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type CanonicalPhase,
  type CoordinatorAction,
  decideCoordinatorAction,
  isCanonicalPhase,
  sinceForPhase,
} from '../../../src/lib/integrations/sync-orchestration.ts';
import {
  buildRunContextFromMaster,
  createSlaveJob,
  dispatchPhase,
  isPhaseAlreadyComplete,
  type JobRow,
  loadIntegration,
  loadJob,
  loadSlavesForRun,
  markJobFailed,
  markSlaveSkipped,
  phasesInRunFromMaster,
  reviveOrFailSlave,
  runAnalysisPhase,
  updateCircuitBreakerState,
  updateMasterJob,
} from '../_shared/sync-coordinator-actions.ts';

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isLiveMode(): boolean {
  return Deno.env.get('SYNC_COORDINATOR_LIVE') === 'true';
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function recordShadowDecision(
  admin: ReturnType<typeof createAdminClient>,
  master: JobRow,
  decision: CoordinatorAction,
): Promise<void> {
  const progress = { ...(master.progress ?? {}) };
  const meta = typeof progress.meta === 'object' && progress.meta !== null
    ? { ...(progress.meta as Record<string, unknown>) }
    : {};
  meta.shadow_decision = { ...decision, decided_at: new Date().toISOString() };
  progress.meta = meta;

  const { error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .update({ progress })
    .eq('id', master.id);
  if (error) throw new Error(`Failed to record shadow decision: ${error.message}`);
}

/** Executes exactly the one action decideCoordinatorAction returned. */
async function executeAction(
  admin: ReturnType<typeof createAdminClient>,
  masterJobId: string,
  master: JobRow,
  slaves: readonly JobRow[],
  action: CoordinatorAction,
): Promise<void> {
  const resolvedIntegration = await loadIntegration(admin, master.tenant_integration_id);
  const ctx = buildRunContextFromMaster(master, master.job_type);

  switch (action.type) {
    case 'noop':
      return;

    case 'dispatch_next_phase': {
      const phase = action.phase;
      const existing = slaves.find((s) => s.phase === phase);
      const slaveId = existing?.id ?? await createSlaveJob(admin, {
        tenantId: resolvedIntegration.tenant_id,
        tenantIntegrationId: resolvedIntegration.id,
        masterJobId,
        syncRunId: masterJobId,
        phase,
        jobType: ctx.jobType,
        triggeredBy: null,
        sinceDate: sinceForPhase(phase, ctx),
      });

      if (await isPhaseAlreadyComplete(admin, {
        tenantIntegrationId: resolvedIntegration.id,
        phase,
        excludeJobId: slaveId,
        masterJobId,
      })) {
        await markSlaveSkipped(admin, slaveId, phase);
        return;
      }

      await updateMasterJob(admin, masterJobId, { status: 'running', currentPhase: phase, nextPage: 1 });
      try {
        await dispatchPhase({
          phase,
          tenantIntegrationId: resolvedIntegration.id,
          jobId: slaveId,
          pageFrom: 1,
          since: sinceForPhase(phase, ctx),
        });
        // Outcome (completed / paused-with-more / failed) is already written
        // by the phase worker onto its own row — the next tick reads it fresh
        // and decides the correct follow-up (next page, next phase, or
        // halt/skip per failure policy). No branching needed here.
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await markJobFailed(admin, slaveId, message);
      }
      return;
    }

    case 'dispatch_next_page': {
      await updateMasterJob(admin, masterJobId, { status: 'running', currentPhase: action.phase, nextPage: action.pageFrom });
      try {
        await dispatchPhase({
          phase: action.phase,
          tenantIntegrationId: resolvedIntegration.id,
          jobId: action.slaveId,
          pageFrom: action.pageFrom,
          since: sinceForPhase(action.phase, ctx),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await markJobFailed(admin, action.slaveId, message);
      }
      return;
    }

    case 'run_analysis':
      await runAnalysisPhase(admin, resolvedIntegration, ctx, null);
      return;

    case 'mark_complete': {
      const phasesInRun = phasesInRunFromMaster(master) as CanonicalPhase[];
      const byPhase = new Map<string, JobRow>();
      for (const s of slaves) if (s.phase && !byPhase.has(s.phase)) byPhase.set(s.phase, s);
      const phasesRun = phasesInRun.filter((p) => byPhase.has(p));
      const phasesFailed = phasesInRun.filter((p) => byPhase.get(p)?.status === 'failed');
      const totalRecordsSynced = slaves.reduce((n, s) => n + (s.records_synced ?? 0), 0);

      await updateMasterJob(admin, masterJobId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        degraded: action.degraded,
        summary: {
          phases_run: phasesRun,
          phases_failed: phasesFailed,
          total_records_synced: totalRecordsSynced,
          last_synced_at: new Date().toISOString(),
        },
      });
      await updateCircuitBreakerState(admin, resolvedIntegration.id, action.degraded ? 'degraded' : 'completed');
      return;
    }

    case 'halt_failed':
      await updateMasterJob(admin, masterJobId, {
        status: 'failed',
        runHalted: true,
        completedAt: new Date().toISOString(),
      });
      await updateCircuitBreakerState(admin, resolvedIntegration.id, 'failed');
      return;

    case 'stale_detected': {
      const staleSlave = slaves.find((s) => s.id === action.slaveId);
      const decision = await reviveOrFailSlave(admin, action.slaveId, staleSlave?.attempt_count ?? 0);
      console.warn(`[sync-coordinator] stale slave phase=${action.phase} slaveId=${action.slaveId}:`, JSON.stringify(decision));
      // A 'permanently_fail' outcome doesn't halt/skip the run itself here —
      // the next tick's decideCoordinatorAction sees this slave's status as
      // 'failed' and applies the normal failure-policy branch (halt or skip),
      // which is also what updates the circuit breaker via mark_complete/
      // halt_failed. No duplicate handling needed.
      return;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let admin: ReturnType<typeof createAdminClient> | null = null;
  let masterJobId: string | null = null;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    masterJobId = typeof body.master_job_id === 'string' ? body.master_job_id : null;
    if (!masterJobId) return json({ ok: false, error: 'master_job_id is required' }, 400);

    admin = createAdminClient();
    const master = await loadJob(admin, masterJobId);
    if (!master) return json({ ok: false, error: 'Master job not found' }, 404);

    const slaves = (await loadSlavesForRun(admin, masterJobId)).filter((s) => isCanonicalPhase(s.phase ?? '') || s.phase === 'analysis');
    const decision = decideCoordinatorAction(master, slaves);

    if (!isLiveMode()) {
      console.log(`[sync-coordinator] shadow decision for ${masterJobId}:`, JSON.stringify(decision));
      await recordShadowDecision(admin, master, decision);
      return json({ ok: true, master_job_id: masterJobId, shadow_mode: true, decision });
    }

    console.log(`[sync-coordinator] executing decision for ${masterJobId}:`, JSON.stringify(decision));
    await executeAction(admin, masterJobId, master, slaves, decision);
    return json({ ok: true, master_job_id: masterJobId, shadow_mode: false, decision });
  } catch (err) {
    console.error('[sync-coordinator]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Coordinator tick failed' }, 500);
  } finally {
    // tick_sync_coordinator() grabs a 4-minute coordinator_lease_until on
    // this master BEFORE firing the request that lands here — meant as a
    // crash/timeout backstop against a concurrent tick double-processing a
    // genuinely stuck invocation. Nothing else ever clears it. Without this
    // release, every phase transition floors at ~4 minutes apart regardless
    // of how fast the actual dispatch was (observed: a 9-phase run stalling
    // for minutes between each phase, once precreation was removed and this
    // became the sole per-phase dispatch path) — release it the instant this
    // invocation is done, success or failure, so the next 15s tick can pick
    // this master straight back up.
    if (admin && masterJobId) {
      const releaseAdmin = admin;
      const releaseId = masterJobId;
      await releaseAdmin.schema('app').from('integration_sync_jobs')
        .update({ coordinator_lease_until: null })
        .eq('id', releaseId)
        .then(() => {}, (err) => console.error('[sync-coordinator] failed to release lease:', err));
    }
  }
});
