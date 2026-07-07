/**
 * Pure orchestration helpers for Zoho sync runs (master-slave model).
 * Imported by integrations-sync edge function and unit tests.
 */

export const MASTER_PHASE = 'sync_run' as const;

export const REFERENCE_PHASES = [
  'locations',
  'products',
  'pricelists',
  'customers',
] as const;

export const TRANSACTIONAL_PHASES = [
  'estimates',
  'orders',
  'invoices',
  'transaction_line_items',
] as const;

export const CANONICAL_PHASES = [
  ...REFERENCE_PHASES,
  ...TRANSACTIONAL_PHASES,
] as const;

export const ANALYSIS_PHASE = 'analysis' as const;

export type CanonicalPhase = (typeof CANONICAL_PHASES)[number];
export type ReferencePhase = (typeof REFERENCE_PHASES)[number];
export type TransactionalPhase = (typeof TRANSACTIONAL_PHASES)[number];

export type RunProfile = 'full_refresh' | 'incremental_daily' | 'continuation' | 'pickup';
export type FailurePolicy = 'halt_on_reference_failure' | 'skip_failed_phases';

export const ACTIVE_MASTER_STATUSES = ['pending', 'running', 'paused'] as const;
export const ACTIVE_SLAVE_STATUSES = ['pending', 'queued', 'running', 'paused'] as const;
export const TERMINAL_SLAVE_STATUSES = ['completed', 'failed', 'cancelled'] as const;

export interface SyncRunContext {
  masterJobId: string;
  syncRunId: string;
  profile: RunProfile;
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
  jobType: string;
  transactionSince: string | null;
  referenceSince: string | null;
}): SyncRunContext {
  return {
    masterJobId: input.masterJobId,
    syncRunId: input.masterJobId,
    profile: input.profile,
    failurePolicy: resolveFailurePolicy(input.profile),
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
  return ctx.failurePolicy === 'halt_on_reference_failure' && isReferencePhase(phase);
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
export function getLatestSlavesByPhase(slaves: SyncJobRow[]): Map<string, SyncJobRow> {
  const map = new Map<string, SyncJobRow>();
  for (const job of slaves) {
    if (job.phase && !map.has(job.phase)) map.set(job.phase, job);
  }
  return map;
}

export function isRunReadyForAnalysis(
  slaves: SyncJobRow[],
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
