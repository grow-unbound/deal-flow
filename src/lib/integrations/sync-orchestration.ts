/**
 * Pure orchestration helpers for Zoho sync runs (master-slave model).
 * Imported by integrations-sync edge function and unit tests.
 */

export const MASTER_PHASE = 'sync_run' as const;

export const REFERENCE_PHASES = [
  'locations',
  'products',
  'inventory',
  'pricelists',
  'customers',
  'contact_persons',
] as const;

export const TRANSACTIONAL_PHASES = [
  'estimates',
  'orders',
  'invoices',
  'invoices_outstanding',
  'customer_payments',
  'transaction_line_items',
] as const;

// Batched per-record Zoho detail-fetch sweeps (one GET per item, up to
// hundreds of items) — the phases most exposed to per-item Zoho stalls/rate
// limiting (see the inventory phase hang incident). Dispatched LAST, after
// every reference/transactional phase has already had its chance, and NEVER
// halt the run on failure (see shouldHaltOnFailure) — a stuck or failed
// detail-fetch sweep must not block data that already synced successfully.
// Membership in REFERENCE_PHASES/TRANSACTIONAL_PHASES is otherwise unchanged
// (since/halt classification for these two stays as before, just overridden
// to never halt) so this is purely an ordering + halt-exemption overlay.
export const DEFERRED_PHASES = ['inventory', 'transaction_line_items'] as const;

const DEFERRED_SET = new Set<string>(DEFERRED_PHASES);

export function isDeferredPhase(phase: string): boolean {
  return DEFERRED_SET.has(phase);
}

export const CANONICAL_PHASES = [
  ...[...REFERENCE_PHASES, ...TRANSACTIONAL_PHASES].filter((phase) => !DEFERRED_SET.has(phase)),
  ...DEFERRED_PHASES,
] as const;

export const ANALYSIS_PHASE = 'analysis' as const;

export type CanonicalPhase = (typeof CANONICAL_PHASES)[number];
export type ReferencePhase = (typeof REFERENCE_PHASES)[number];
export type TransactionalPhase = (typeof TRANSACTIONAL_PHASES)[number];

export type RunProfile = 'full_refresh' | 'incremental_daily' | 'continuation' | 'pickup';
export type FailurePolicy = 'halt_on_reference_failure' | 'skip_failed_phases';

/**
 * First-class tag for "why this run started" — additive alongside job_type
 * (which stays load-bearing for rebuild-window sizing and UI labels).
 * Only meaningful on master (phase=sync_run) rows.
 */
export type RunKind = 'initial_sync' | 'manual_full' | 'manual_phase' | 'daily_incremental';

export const RUN_KINDS: readonly RunKind[] = [
  'initial_sync',
  'manual_full',
  'manual_phase',
  'daily_incremental',
] as const;

export function isRunKind(value: unknown): value is RunKind {
  return typeof value === 'string' && (RUN_KINDS as readonly string[]).includes(value);
}

/**
 * Derives run_kind deterministically from request inputs so callers don't
 * have to reason about it themselves. initial_sync must be passed explicitly
 * by the caller (it isn't derivable from job_type='initial_reference' alone
 * without also checking for the historical initial_transactional value), so
 * this is only the manual/incremental fallback used when a caller doesn't
 * send run_kind explicitly.
 */
export function deriveRunKind(input: { jobType: string; requestedPhase: string | null }): RunKind {
  if (input.jobType === 'initial_reference' || input.jobType === 'initial_transactional') {
    return 'initial_sync';
  }
  if (input.jobType === 'incremental') return 'daily_incremental';
  return input.requestedPhase ? 'manual_phase' : 'manual_full';
}

/** Explicit, uniform failure-policy mapping per run_kind — no silent defaults. */
export function resolveFailurePolicyForRunKind(runKind: RunKind): FailurePolicy {
  switch (runKind) {
    case 'initial_sync':
    case 'manual_full':
      return 'halt_on_reference_failure';
    case 'manual_phase':
    case 'daily_incremental':
      return 'skip_failed_phases';
  }
}

/** True when a run finished but at least one phase was skipped due to failure. */
export function isDegraded(results: readonly { ok: boolean }[]): boolean {
  return results.some((r) => !r.ok);
}

export const ACTIVE_MASTER_STATUSES = ['pending', 'running', 'paused'] as const;
export const ACTIVE_SLAVE_STATUSES = ['pending', 'queued', 'running', 'paused'] as const;
export const TERMINAL_SLAVE_STATUSES = ['completed', 'failed', 'cancelled'] as const;

export interface SyncRunContext {
  masterJobId: string;
  syncRunId: string;
  profile: RunProfile;
  runKind: RunKind;
  failurePolicy: FailurePolicy;
  transactionSince: string | null;
  referenceSince: string | null;
  jobType: string;
}

export interface ContinuationPayload {
  tenant_integration_id: string;
  master_job_id: string;
  sync_run_id: string;
  phase: string;
  page_from: number;
  job_id: string;
  job_type: string;
  since?: string | null;
  continuation: true;
}

export interface SyncJobRow {
  id: string;
  phase: string | null;
  status: string;
  progress?: Record<string, unknown> | null;
}

const REFERENCE_SET = new Set<string>(REFERENCE_PHASES);
const TRANSACTIONAL_SET = new Set<string>(TRANSACTIONAL_PHASES);
const CANONICAL_SET = new Set<string>(CANONICAL_PHASES);

export function isReferencePhase(phase: string): phase is ReferencePhase {
  return REFERENCE_SET.has(phase);
}

export function isTransactionalPhase(phase: string): phase is TransactionalPhase {
  return TRANSACTIONAL_SET.has(phase);
}

export function isCanonicalPhase(phase: string): phase is CanonicalPhase {
  return CANONICAL_SET.has(phase);
}

/** Previous IST calendar date (YYYY-MM-DD) — used for daily 5AM incremental window. */
export function dailySinceDateIst(now: Date = new Date()): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  ist.setUTCDate(ist.getUTCDate() - 1);
  const y = ist.getUTCFullYear();
  const m = `${ist.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${ist.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveFailurePolicy(profile: RunProfile): FailurePolicy {
  return profile === 'full_refresh' ? 'halt_on_reference_failure' : 'skip_failed_phases';
}

export function resolveRunProfile(input: {
  forceFullRefresh: boolean;
  jobType: string;
  isContinuation: boolean;
}): RunProfile {
  if (input.isContinuation) return 'continuation';
  if (input.forceFullRefresh) return 'full_refresh';
  if (input.jobType === 'incremental') return 'incremental_daily';
  return 'pickup';
}

export function buildSyncRunContext(input: {
  masterJobId: string;
  profile: RunProfile;
  runKind: RunKind;
  jobType: string;
  transactionSince: string | null;
  referenceSince: string | null;
}): SyncRunContext {
  return {
    masterJobId: input.masterJobId,
    syncRunId: input.masterJobId,
    profile: input.profile,
    runKind: input.runKind,
    failurePolicy: resolveFailurePolicyForRunKind(input.runKind),
    transactionSince: input.transactionSince,
    referenceSince: input.referenceSince,
    jobType: input.jobType,
  };
}

/** Full refresh: reference phases ignore since; transactional use transactionSince. */
export function sinceForPhase(phase: string, ctx: SyncRunContext): string | null {
  if (ctx.profile === 'full_refresh' && isReferencePhase(phase)) {
    return null;
  }
  if (isTransactionalPhase(phase)) {
    return ctx.transactionSince;
  }
  return ctx.referenceSince;
}

export function shouldHaltOnFailure(phase: string, ctx: SyncRunContext): boolean {
  return ctx.failurePolicy === 'halt_on_reference_failure' && isReferencePhase(phase) && !isDeferredPhase(phase);
}

export function getSyncRunIdFromProgress(progress: Record<string, unknown> | null | undefined): string | null {
  const meta = progress?.meta;
  if (!meta || typeof meta !== 'object') return null;
  const syncRunId = (meta as Record<string, unknown>).sync_run_id;
  return typeof syncRunId === 'string' && syncRunId.length > 0 ? syncRunId : null;
}

export function getMasterJobIdFromProgress(progress: Record<string, unknown> | null | undefined): string | null {
  const meta = progress?.meta;
  if (!meta || typeof meta !== 'object') return null;
  const masterId = (meta as Record<string, unknown>).master_job_id;
  return typeof masterId === 'string' && masterId.length > 0 ? masterId : null;
}

export function isSlaveJob(row: SyncJobRow): boolean {
  if (!row.phase || row.phase === MASTER_PHASE) return false;
  return isCanonicalPhase(row.phase) || row.phase === ANALYSIS_PHASE;
}

export function filterSlavesForRun(jobs: SyncJobRow[], syncRunId: string): SyncJobRow[] {
  return jobs.filter((job) => {
    if (job.phase === MASTER_PHASE) return false;
    const runId = getSyncRunIdFromProgress(job.progress ?? null);
    const masterId = getMasterJobIdFromProgress(job.progress ?? null);
    return runId === syncRunId || masterId === syncRunId;
  });
}

export function getLatestSlaveForPhase(slaves: SyncJobRow[], phase: string): SyncJobRow | null {
  for (const job of slaves) {
    if (job.phase === phase) return job;
  }
  return null;
}

/** Assumes `slaves` are sorted newest-first (created_at DESC). */
export function getLatestSlavesByPhase<T extends SyncJobRow>(slaves: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const job of slaves) {
    if (job.phase && !map.has(job.phase)) map.set(job.phase, job);
  }
  return map;
}

export function isRunReadyForAnalysis(
  slaves: readonly SyncJobRow[],
  phasesInRun: readonly string[] = CANONICAL_PHASES,
): boolean {
  const canonicalInRun = phasesInRun.filter(isCanonicalPhase);
  if (canonicalInRun.length === 0) return false;

  const hasReference = canonicalInRun.some(isReferencePhase);
  const hasTransactional = canonicalInRun.some(isTransactionalPhase);
  if (!hasReference || !hasTransactional) return false;

  const byPhase = getLatestSlavesByPhase(slaves);
  for (const phase of canonicalInRun) {
    const latest = byPhase.get(phase);
    if (!latest) return false;
    if (!TERMINAL_SLAVE_STATUSES.includes(latest.status as (typeof TERMINAL_SLAVE_STATUSES)[number])) {
      return false;
    }
  }
  return true;
}

export function isMasterRunActive(master: SyncJobRow): boolean {
  if (master.phase !== MASTER_PHASE) return false;
  const progress = master.progress ?? {};
  const meta = typeof progress.meta === 'object' && progress.meta !== null
    ? (progress.meta as Record<string, unknown>)
    : {};
  if (meta.run_cancelled === true || meta.run_halted === true) return false;
  return (ACTIVE_MASTER_STATUSES as readonly string[]).includes(master.status);
}

export function buildContinuationPayload(input: {
  tenantIntegrationId: string;
  ctx: SyncRunContext;
  phase: string;
  pageFrom: number;
  jobId: string;
  since?: string | null;
}): ContinuationPayload {
  return {
    tenant_integration_id: input.tenantIntegrationId,
    master_job_id: input.ctx.masterJobId,
    sync_run_id: input.ctx.syncRunId,
    phase: input.phase,
    page_from: input.pageFrom,
    job_id: input.jobId,
    job_type: input.ctx.jobType,
    since: input.since ?? sinceForPhase(input.phase, input.ctx),
    continuation: true,
  };
}

export function nextPhaseAfter(current: string): CanonicalPhase | null {
  const idx = CANONICAL_PHASES.indexOf(current as CanonicalPhase);
  if (idx < 0 || idx >= CANONICAL_PHASES.length - 1) return null;
  return CANONICAL_PHASES[idx + 1] ?? null;
}

export function phaseIndex(phase: string): number {
  return CANONICAL_PHASES.indexOf(phase as CanonicalPhase);
}

export const PHASE_GROUP_EXPANSION: Record<string, readonly CanonicalPhase[]> = {
  reference: REFERENCE_PHASES,
  transactional: TRANSACTIONAL_PHASES,
};

export function resolvePhasesToRun(requestedPhaseRaw: string | null): readonly CanonicalPhase[] {
  if (!requestedPhaseRaw) return CANONICAL_PHASES;
  const expanded = PHASE_GROUP_EXPANSION[requestedPhaseRaw];
  if (expanded) return expanded;
  if (isCanonicalPhase(requestedPhaseRaw)) return [requestedPhaseRaw];
  return CANONICAL_PHASES;
}

/** Full orchestrated import — omits line-item hydration (manual / incremental only). */
export const FULL_SYNC_PHASES: readonly CanonicalPhase[] = [
  'locations',
  'products',
  'pricelists',
  'customers',
  'contact_persons',
  'estimates',
  'orders',
  'invoices',
  'customer_payments',
  'inventory',
];

export type SyncEnrichmentPolicy = 'full_sync' | 'incremental';

export function resolveSyncEnrichmentPolicy(jobType: string): SyncEnrichmentPolicy {
  return jobType === 'incremental' ? 'incremental' : 'full_sync';
}

export type EntityEnrichmentMode = 'list_only' | 'detail_when_needed' | 'keep_current';

export function enrichmentModeForEntity(
  policy: SyncEnrichmentPolicy,
  entityType: string,
): EntityEnrichmentMode {
  if (entityType === 'products' || entityType === 'pricelists') {
    return 'keep_current';
  }
  if (entityType === 'customers') {
    return policy === 'full_sync' ? 'list_only' : 'detail_when_needed';
  }
  if (
    entityType === 'locations'
    || entityType === 'warehouses'
    || entityType === 'estimates'
    || entityType === 'orders'
    || entityType === 'invoices'
    || entityType === 'invoices_outstanding'
    || entityType === 'customer_payments'
  ) {
    return 'list_only';
  }
  return 'keep_current';
}

// transaction_line_items only ever runs automatically as part of the daily
// incremental sync (scoped to the since-window so it only touches entities
// brought in during that period) — it stays out of every manual trigger
// path (full sync, phase-group expansion, or an explicit single-phase
// request), regardless of `requestedPhase`. It remains in
// TRANSACTIONAL_PHASES for since/halt-policy classification purposes; only
// its reachability through this function is cut. Manual/controlled
// backfills go straight to the sync-transaction-line-items edge function
// instead, bypassing this orchestrator entirely (see that function's
// header for the direct-invocation contract).
export function resolvePhasesForPolicy(input: {
  requestedPhase: string | null;
  enrichmentPolicy: SyncEnrichmentPolicy;
}): readonly CanonicalPhase[] {
  const base = input.requestedPhase
    ? resolvePhasesToRun(input.requestedPhase)
    : (input.enrichmentPolicy === 'incremental' ? CANONICAL_PHASES : FULL_SYNC_PHASES);
  return input.enrichmentPolicy === 'incremental'
    ? base
    : base.filter((phase) => phase !== 'transaction_line_items');
}

// ── Coordinator decision logic ──────────────────────────────────────────────
//
// Pure "given current DB state, what is the single next action" function —
// this is what the sync-coordinator edge function calls on every tick, and
// what phase-worker completion used to decide for itself via selfChain. The
// worker no longer decides anything; it just writes its own terminal state
// (a slave row's own `status`/`progress.next_cursor` already fully describes
// whether that phase needs another page, per runPhaseSync in sync-utils.ts),
// and the coordinator reads that state fresh on each tick. This makes each
// tick idempotent: calling it again after the decided action has been taken
// just naturally advances to the next state, with no "did I already fire"
// bookkeeping needed.

export interface CoordinatorSlaveRow extends SyncJobRow {
  heartbeat_at?: string | null;
  attempt_count?: number | null;
  next_retry_eligible_at?: string | null;
}

export interface CoordinatorMasterRow {
  id: string;
  status: string;
  run_kind: string | null;
  progress: Record<string, unknown> | null;
}

export type CoordinatorAction =
  | { type: 'noop'; reason: 'aborted' | 'nothing_to_do' }
  | { type: 'dispatch_next_page'; phase: CanonicalPhase; slaveId: string; pageFrom: number }
  | { type: 'dispatch_next_phase'; phase: CanonicalPhase }
  | { type: 'run_analysis' }
  | { type: 'mark_complete'; degraded: boolean }
  | { type: 'halt_failed'; phase: CanonicalPhase }
  // Phase 3 wires bounded revival onto this — Phase 2's coordinator only
  // detects and reports it (shadow mode has nothing to compare this against,
  // since self-chain has no revival concept; the once-daily reaper is the
  // only thing that currently acts on staleness).
  | { type: 'stale_detected'; phase: CanonicalPhase; slaveId: string };

function masterMeta(master: CoordinatorMasterRow): Record<string, unknown> {
  const progress = master.progress ?? {};
  const meta = progress.meta;
  return typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
}

function isMasterAborted(master: CoordinatorMasterRow): boolean {
  if (master.status === 'cancelled' || master.status === 'failed') return true;
  const meta = masterMeta(master);
  return meta.run_cancelled === true || meta.run_halted === true;
}

/**
 * lease_timeout for "is a running slave still alive" — see heartbeat_at
 * column comment (add_heartbeat_and_revival_columns migration) for the
 * ~150s-worst-case-Zoho-retry justification. Checked every coordinator tick.
 */
export const STALE_RUNNING_LEASE_MS = 5 * 60 * 1000;

export function decideCoordinatorAction(
  master: CoordinatorMasterRow,
  slavesNewestFirst: readonly CoordinatorSlaveRow[],
  opts: { now?: Date } = {},
): CoordinatorAction {
  if (isMasterAborted(master)) return { type: 'noop', reason: 'aborted' };

  const now = opts.now ?? new Date();
  const progress = master.progress ?? {};
  const phasesInRun = (Array.isArray(progress.phases_in_run)
    ? progress.phases_in_run.filter(isCanonicalPhase)
    : [...CANONICAL_PHASES]) as CanonicalPhase[];
  const runKind = isRunKind(master.run_kind)
    ? master.run_kind
    : deriveRunKind({ jobType: '', requestedPhase: phasesInRun.length === 1 ? phasesInRun[0] : null });
  const failurePolicy = resolveFailurePolicyForRunKind(runKind);

  const byPhase = getLatestSlavesByPhase(slavesNewestFirst);
  const results: { ok: boolean }[] = [];

  for (const phase of phasesInRun) {
    const slave = byPhase.get(phase);

    if (!slave) return { type: 'dispatch_next_phase', phase };

    if (slave.status === 'paused') {
      const nextCursor = (slave.progress?.next_cursor ?? null) as { page?: number } | null;
      return { type: 'dispatch_next_page', phase, slaveId: slave.id, pageFrom: nextCursor?.page ?? 1 };
    }

    if (slave.status === 'pending' || slave.status === 'queued') {
      // Respect the exponential-backoff gate after a revival — don't
      // immediately redispatch a slave that just failed and was revived;
      // wait until its backoff window has elapsed.
      const retryEligibleAt = slave.next_retry_eligible_at ? new Date(slave.next_retry_eligible_at).getTime() : null;
      if (retryEligibleAt !== null && now.getTime() < retryEligibleAt) {
        return { type: 'noop', reason: 'nothing_to_do' };
      }
      return { type: 'dispatch_next_phase', phase };
    }

    if (slave.status === 'running') {
      const heartbeatAt = slave.heartbeat_at ? new Date(slave.heartbeat_at).getTime() : null;
      if (heartbeatAt !== null && now.getTime() - heartbeatAt > STALE_RUNNING_LEASE_MS) {
        return { type: 'stale_detected', phase, slaveId: slave.id };
      }
      return { type: 'noop', reason: 'nothing_to_do' };
    }

    if (slave.status === 'failed') {
      results.push({ ok: false });
      // Deferred phases (inventory, transaction_line_items — batched
      // per-record Zoho detail-fetch sweeps, the ones most exposed to
      // per-item stalls/timeouts) must never halt the run even under
      // halt_on_reference_failure — matches shouldHaltOnFailure's own
      // !isDeferredPhase guard. This branch used to duplicate that check
      // inline without the exemption, so a deferred phase's failure (e.g.
      // sync-inventory's dispatch timing out on a large catalog) halted an
      // otherwise fully-synced run.
      if (failurePolicy === 'halt_on_reference_failure' && isReferencePhase(phase) && !isDeferredPhase(phase)) {
        return { type: 'halt_failed', phase };
      }
      continue; // skip_failed_phases (or a deferred-phase exemption): move on to the next phase
    }

    // completed / cancelled — this phase is done, move to the next.
    results.push({ ok: slave.status === 'completed' });
  }

  const analysisSlave = byPhase.get(ANALYSIS_PHASE);
  if (!analysisSlave && isRunReadyForAnalysis(slavesNewestFirst, phasesInRun)) {
    return { type: 'run_analysis' };
  }

  return { type: 'mark_complete', degraded: isDegraded(results) };
}

// ── Bounded revival ──────────────────────────────────────────────────────────
//
// Direct fix for the incident where a tight-cadence reaper blindly re-revived
// a failing/incomplete job with no stop-clause and burned the tenant's entire
// Zoho API rate limit. A slave gets at most MAX_REVIVAL_ATTEMPTS revivals,
// with exponential (not fixed-interval) backoff between them; past the cap
// it's marked permanently failed and never auto-revived again — only an
// explicit human retrigger (app.retry_sync_phase RPC) can restart it.

export const MAX_REVIVAL_ATTEMPTS = 3;
export const REVIVAL_BACKOFF_BASE_MS = 30_000;
export const REVIVAL_BACKOFF_MULTIPLIER = 3;

/** 30s, 90s, 270s for attempts 1, 2, 3. */
export function revivalBackoffMs(attemptNumber: number): number {
  return REVIVAL_BACKOFF_BASE_MS * Math.pow(REVIVAL_BACKOFF_MULTIPLIER, attemptNumber - 1);
}

export type RevivalDecision =
  | { type: 'revive'; nextAttemptCount: number; nextRetryEligibleAt: string }
  | { type: 'permanently_fail'; nextAttemptCount: number };

export function decideRevival(input: { currentAttemptCount: number; now?: Date }): RevivalDecision {
  const now = input.now ?? new Date();
  const nextAttemptCount = input.currentAttemptCount + 1;
  if (nextAttemptCount > MAX_REVIVAL_ATTEMPTS) {
    return { type: 'permanently_fail', nextAttemptCount };
  }
  const nextRetryEligibleAt = new Date(now.getTime() + revivalBackoffMs(nextAttemptCount)).toISOString();
  return { type: 'revive', nextAttemptCount, nextRetryEligibleAt };
}

// ── Circuit breaker ──────────────────────────────────────────────────────────
//
// After CIRCUIT_BREAKER_FAILURE_THRESHOLD consecutive fully-failed runs for
// one tenant integration, automatic (cron-triggered) syncs stop until a human
// acknowledges (app.acknowledge_sync_suspension RPC) — manual syncs from
// Settings remain allowed throughout.

export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;

export interface CircuitBreakerUpdate {
  consecutiveRunFailures: number;
  shouldSuspend: boolean;
}

export function decideCircuitBreaker(input: {
  consecutiveRunFailures: number;
  runOutcome: 'failed' | 'completed' | 'degraded';
}): CircuitBreakerUpdate {
  if (input.runOutcome !== 'failed') {
    return { consecutiveRunFailures: 0, shouldSuspend: false };
  }
  const next = input.consecutiveRunFailures + 1;
  return { consecutiveRunFailures: next, shouldSuspend: next >= CIRCUIT_BREAKER_FAILURE_THRESHOLD };
}
