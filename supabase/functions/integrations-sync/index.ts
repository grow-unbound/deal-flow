/**
 * integrations-sync — Sequential sync orchestrator (wineyard pattern).
 *
 * Replaces the old concurrent-dispatch model (dispatchWorkerInvocation × N phases)
 * with sequential calls to dedicated per-entity sync-* functions.
 * Each phase runs to completion before the next starts, eliminating concurrent
 * Zoho API calls and the code-43 rate limit errors they caused.
 *
 * Flow:
 *   POST /integrations-sync { tenant_integration_id, phase?, page_from? }
 *   → Creates one integration_sync_jobs row per phase (status: pending)
 *   → Invokes sync-{phase} sequentially, awaiting each before starting the next
 *   → Returns { ok, status: 'complete'|'paused', phases: [...per-phase results] }
 *
 * If a phase returns has_more=true (page limit hit), the orchestrator returns early
 * with status='paused'. The caller (frontend or cron) must POST again with
 *   { tenant_integration_id, phase: '<paused_phase>', page_from: <next_page> }
 * to resume.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Constants ────────────────────────────────────────────────────────────────

// Canonical phase execution order — respects FK dependencies:
//   locations → products → pricelists → customers → estimates → orders → invoices
const ALL_PHASES = [
  'locations',
  'products',
  'pricelists',
  'customers',
  'estimates',
  'orders',
  'invoices',
  'transaction_line_items',
] as const;

type PhaseName = (typeof ALL_PHASES)[number];

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

// ── Integration & job helpers ─────────────────────────────────────────────────

interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  status: string;
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

async function createPhaseJob(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    phase: string;
    jobType: string;
    triggeredBy: string | null;
    sinceDate?: string | null;
    syncRunId: string;
    dependsOnPhase?: string | null;
  },
): Promise<string> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      job_type: opts.jobType,
      phase: opts.phase,
      status: 'pending',
      progress: {
        meta: {
          sync_run_id: opts.syncRunId,
          depends_on_phase: opts.dependsOnPhase ?? null,
        },
      },
      since_date: opts.sinceDate ?? null,
      triggered_by: opts.triggeredBy,
      created_by: opts.triggeredBy,
      updated_by: opts.triggeredBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create phase job: ${error.message}`);
  return data.id as string;
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

async function setIntegrationStatus(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
  status: string,
): Promise<void> {
  await admin.schema('app').from('tenant_integrations').update({
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', integrationId);
}

// ── Dispatch a single sync-* function ────────────────────────────────────────

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

// Per-entity resume: when a "Sync again" call doesn't target a specific phase
// (i.e. a fresh full-run request), each phase otherwise always starts at page 1 —
// even if its last attempt was paused, cancelled, or failed partway through.
//
// Every full-run invocation pre-creates a pending job row for EVERY phase up
// front (see createPhaseJob loop below), even ones the orchestrator never
// reaches before the user cancels again. That placeholder row (status
// 'cancelled', zero progress) is always the most recently created row for that
// phase — a naive "most recent job" lookup picks it up and shadows the actual
// resumable progress from an earlier run. So walk back through history and
// skip placeholder rows that never actually ran, stopping at the first row
// that either completed (fresh start — a later successful attempt supersedes
// any earlier partial one) or carries real progress (resume point).
async function resolvePhaseResumePage(
  admin: ReturnType<typeof createAdminClient>,
  opts: { tenantIntegrationId: string; phase: string; excludeJobId: string },
): Promise<number | null> {
  const { data } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('status, progress')
    .eq('tenant_integration_id', opts.tenantIntegrationId)
    .eq('phase', opts.phase)
    .neq('id', opts.excludeJobId)
    .order('created_at', { ascending: false })
    .limit(10);

  for (const row of data ?? []) {
    const progress = (row.progress ?? {}) as Record<string, unknown>;
    const pagesFetched = typeof progress.pages_fetched === 'number' ? progress.pages_fetched : 0;

    if (row.status === 'completed') return null; // most recent real attempt succeeded — fresh start

    if (pagesFetched > 0) {
      const nextCursor = progress.next_cursor as { page?: number } | undefined;
      return typeof nextCursor?.page === 'number' ? nextCursor.page : pagesFetched + 1;
    }

    // Placeholder row (created upfront, never actually dispatched) — keep looking further back.
  }

  return null;
}

// Reuse the historical window from the latest real attempt for this phase.
// Resume calls may arrive without an explicit `since` when the scheduler or
// orchestrator is continuing a paused run, so recover it from job state rather
// than letting transactional phases fall back to FY start.
async function resolvePhaseSince(
  admin: ReturnType<typeof createAdminClient>,
  opts: { tenantIntegrationId: string; phase: string; excludeJobId: string },
): Promise<string | null> {
  const { data } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('since_date, progress')
    .eq('tenant_integration_id', opts.tenantIntegrationId)
    .eq('phase', opts.phase)
    .neq('id', opts.excludeJobId)
    .order('created_at', { ascending: false })
    .limit(10);

  for (const row of data ?? []) {
    if (typeof row.since_date === 'string' && row.since_date.trim().length > 0) {
      return row.since_date.trim();
    }

    const progress = (row.progress ?? {}) as Record<string, unknown>;
    if (typeof progress.since === 'string' && progress.since.trim().length > 0) {
      return progress.since.trim();
    }
  }

  return null;
}

// "Pick up from last sync" (the default, non-force-refresh path): if a phase's
// most recent real attempt already completed, there's nothing new to fetch —
// skip calling Zoho for it entirely rather than re-crawling everything from
// page 1. Only a `force_full_refresh` request (explicit start date, from the
// dialog's "Full historical refresh" toggle) should ever re-run a completed phase.
async function isPhaseAlreadyComplete(
  admin: ReturnType<typeof createAdminClient>,
  opts: { tenantIntegrationId: string; phase: string; excludeJobId: string },
): Promise<boolean> {
  const { data } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('status')
    .eq('tenant_integration_id', opts.tenantIntegrationId)
    .eq('phase', opts.phase)
    .neq('id', opts.excludeJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.status === 'completed';
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
    if (!tenantIntegrationId) return json({ ok: false, error: 'tenant_integration_id is required' }, 400);

    // Resolve which phases to run.
    // The frontend's phase-group "Sync Again" buttons pass a GROUP id
    // ('reference' / 'transactional' — see SYNC_PHASE_GROUPS in
    // ConnectedIntegrationCard.tsx), not a real per-entity phase name. Passing
    // that straight through to dispatchPhase tried to fetch
    // `/functions/v1/sync-transactional`, which doesn't exist (404) — only
    // the 7 individual sync-{phase} functions exist. Expand group ids to
    // their real constituent phases before building phasesToRun.
    const PHASE_GROUP_EXPANSION: Record<string, PhaseName[]> = {
      reference: ['locations', 'products', 'pricelists', 'customers'],
      transactional: ['estimates', 'orders', 'invoices', 'transaction_line_items'],
    };
    const requestedPhaseRaw = typeof body.phase === 'string' ? body.phase : null;
    const requestedPhase = requestedPhaseRaw && (ALL_PHASES as readonly string[]).includes(requestedPhaseRaw)
      ? requestedPhaseRaw as PhaseName
      : null;
    const pageFrom = typeof body.page_from === 'number' ? body.page_from : null;
    const since = typeof body.since === 'string' ? body.since : null;
    const jobType = typeof body.job_type === 'string' ? body.job_type : 'manual';
    const forceFullRefresh = body.force_full_refresh === true;

    const phasesToRun: PhaseName[] = requestedPhaseRaw
      ? PHASE_GROUP_EXPANSION[requestedPhaseRaw] ?? (requestedPhase ? [requestedPhase] : [...ALL_PHASES])
      : [...ALL_PHASES];

    // Determine actor from Authorization header (nullable for internal calls)
    const authHeader = req.headers.get('Authorization');
    let actorUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      // Try to resolve user from Supabase — best-effort, non-blocking
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
    const syncRunId = crypto.randomUUID();

    // Concurrent-start guard — atomic claim, not read-then-write. A separate
    // "check status, then UPDATE" has a race window: the 30s cron tick and a
    // user's "Sync again" click (or two cron ticks, since pg_net's HTTP
    // delivery is async and can lag past 30s) can both read status='connected'
    // before either writes 'syncing', so both pass the guard, both create a
    // full new set of phase jobs, and both run concurrently against the same
    // buyer/buyer_user rows — which is exactly what surfaces as Postgres
    // lock_timeout errors. A single conditional UPDATE is atomic under
    // Postgres row-level locking: only the first caller to reach the row
    // flips it; the second sees status already 'syncing' and its UPDATE
    // affects zero rows.
    const { data: claimed, error: claimError } = await admin
      .schema('app')
      .from('tenant_integrations')
      .update({ status: 'syncing', updated_at: new Date().toISOString() })
      .eq('id', integration.id)
      .neq('status', 'syncing')
      .select('id')
      .maybeSingle();

    if (claimError) return json({ ok: false, error: claimError.message }, 500);
    if (!claimed) {
      return json({ ok: false, error: 'Sync already in progress', code: 'SYNC_ACTIVE' }, 409);
    }

    // Re-arm the resume/reaper cron — it self-unschedules after 24h of no
    // activity (see app.run_zoho_orchestrator_cron), so every new sync run
    // needs to guarantee it's actually watching again. Idempotent, best-effort.
    await admin.schema('app').rpc('ensure_zoho_sync_cron_scheduled');

    // Create one pending job row per phase upfront — frontend subscribes via Realtime
    const jobIds: Record<string, string> = {};
    for (const phase of phasesToRun) {
      jobIds[phase] = await createPhaseJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        phase,
        jobType,
        triggeredBy: actorUserId,
        sinceDate: since ?? null,
        syncRunId,
        dependsOnPhase: phase === 'transaction_line_items' ? 'invoices' : null,
      });
    }

    // Run phases sequentially, ONE dispatch call per phase per invocation.
    //
    // Previously this re-dispatched the SAME phase in a `while(true)` loop
    // whenever it returned has_more, bailing out only once the orchestrator's
    // own elapsed time crossed ORCH_BUDGET_MS. That's a compounding risk: a
    // single dispatchPhase call can itself take up to TIME_BUDGET_MS (~120s,
    // see sync-utils.ts). Two such calls back-to-back push the orchestrator's
    // own wall-clock time well past Supabase's ~150s hard invocation limit —
    // the platform force-kills the function mid-second-call (observed as
    // status 546), losing the graceful pause write entirely and leaving the
    // job stuck until the reaper cleans it up. Since the cron now resumes
    // paused/incomplete phases every 30s anyway, there's no need to gamble on
    // a second in-process call — always pause and return immediately the
    // moment a phase reports has_more, and let the next cron tick continue it.
    // The ORCH_BUDGET_MS check still gates whether to advance to the NEXT
    // phase within this same invocation (keeps small, fast tenants able to
    // finish all 7 phases in one go without needing 7 separate cron ticks).
    const ORCH_BUDGET_MS = 100_000;
    const orchStart = Date.now();
    const results: PhaseResult[] = [];

    for (let phaseIndex = 0; phaseIndex < phasesToRun.length; phaseIndex++) {
      const phase = phasesToRun[phaseIndex];

      // Default behavior ("pick up from last sync"): a phase whose last real
      // attempt already completed has nothing new to fetch — skip it rather
      // than re-crawling everything from page 1. Only the explicit "Full
      // historical refresh" toggle (force_full_refresh + a start date) should
      // ever re-run an already-completed phase.
      if (!forceFullRefresh && await isPhaseAlreadyComplete(admin, {
        tenantIntegrationId: integration.id,
        phase,
        excludeJobId: jobIds[phase],
      })) {
        const now = new Date().toISOString();
        await admin.schema('app').from('integration_sync_jobs').update({
          status: 'completed',
          completed_at: now,
          updated_at: now,
          progress: {
            phase,
            phase_label: 'Skipped — already up to date',
            note: 'Skipped: previous sync already completed this phase. Use "Full historical refresh" to force a re-sync.',
          },
        }).eq('id', jobIds[phase]);
        results.push({ ok: true, phase, records_synced: 0, has_more: false, next_cursor: null });
        continue;
      }

      // For a targeted phase resume, apply the provided cursor; otherwise check
      // whether this phase's last attempt left off partway through and pick up
      // from there instead of starting fresh.
      let phasePageFrom: number | null = (phase === requestedPhase ? pageFrom : null);
      if (phasePageFrom === null) {
        phasePageFrom = await resolvePhaseResumePage(admin, {
          tenantIntegrationId: integration.id,
          phase,
          excludeJobId: jobIds[phase],
        });
      }
      const phaseSince = since ?? await resolvePhaseSince(admin, {
        tenantIntegrationId: integration.id,
        phase,
        excludeJobId: jobIds[phase],
      });

      try {
        const result = await dispatchPhase({
          phase,
          tenantIntegrationId: integration.id,
          jobId: jobIds[phase],
          pageFrom: phasePageFrom,
          since: phaseSince,
        });

        results.push(result);

        if (result.has_more) {
          // Phase needs more pages — hand off to cron immediately rather than
          // risking a second in-process call.
          const cursor = result.next_cursor;
          await setIntegrationStatus(admin, integration.id, 'connected');
          return json({
            ok: true,
            status: 'paused',
            paused_at: phase,
            job_ids: jobIds,
            results,
            resume: {
              tenant_integration_id: integration.id,
              phase,
              page_from: (cursor as { page?: number } | null)?.page ?? null,
              next_cursor: cursor,
            },
          });
        }

        if (Date.now() - orchStart > ORCH_BUDGET_MS) {
          // Out of budget to safely attempt another phase in this invocation.
          // The next phase's job row is still sitting at 'pending' — the
          // cron's resume query only looks at status='paused' with a cursor,
          // so a 'pending' row would otherwise never get picked back up.
          // Flip it to 'paused' with a page-1 cursor so cron resumes it.
          const nextPhase = phasesToRun[phaseIndex + 1];
          if (nextPhase) {
            await admin.schema('app').from('integration_sync_jobs').update({
              status: 'paused',
              progress: {
                next_cursor: { phase: nextPhase, entity_type: nextPhase, page: 1, per_page: 200, has_more: true, since: since ?? null },
              },
              updated_at: new Date().toISOString(),
            }).eq('id', jobIds[nextPhase]);
          }
          await setIntegrationStatus(admin, integration.id, 'connected');
          return json({ ok: true, status: 'paused', paused_at: nextPhase ?? null, job_ids: jobIds, results });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await markJobFailed(admin, jobIds[phase], message);
        await setIntegrationStatus(admin, integration.id, 'connected');
        return json({
          ok: false,
          status: 'failed',
          failed_at: phase,
          error: message,
          job_ids: jobIds,
          results,
        }, 500);
      }
    }

    // Phase 3 — Snapshots + KPI rebuild.
    //
    // Architectural decision: reco suite (popularity, associations, buyer profiles, bundles)
    // runs weekly via pg_cron, NOT per-sync. Reasons:
    //   1. Reco models need week-over-week signal to show meaningful change
    //   2. 6 sequential full-table-scan RPCs risk the 150s Edge Function limit for large tenants
    //   3. Multi-tenant parallel: concurrent reco scans saturate Postgres CPU
    //
    // The DB trigger (trg_integration_sync_jobs_post_rebuild) already fires post_sync_rebuild
    // on each phase job completion with p_days=2 (incremental window). Here we only run the
    // explicit 90-day rebuild for initial syncs where the trigger window is insufficient.
    // For incremental syncs, skip — trigger already handled it.
    const totalSynced = results.reduce((sum, r) => sum + r.records_synced, 0);
    const isInitialSync = jobType === 'initial_reference' || jobType === 'initial_transactional';
    if (totalSynced > 0) {
      const analysisJobId = await createPhaseJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        phase: 'analysis',
        jobType,
        triggeredBy: actorUserId,
        sinceDate: since ?? null,
      });
      jobIds['analysis'] = analysisJobId;
      await admin.schema('app').from('integration_sync_jobs').update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress: { phase_label: 'Rebuilding snapshots and KPI…' },
      }).eq('id', analysisJobId);

      try {
        if (isInitialSync) {
          // Trigger used p_days=2 incrementally — correct to 90 days for full history on first load
          await admin.schema('app').rpc('post_sync_rebuild', {
            p_tenant_id: integration.tenant_id,
            p_days: 90,
          });
        }

        await admin.schema('app').from('integration_sync_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          progress: {
            phase_label: 'Snapshots and KPI ready. Recommendations update weekly via scheduled job.',
          },
        }).eq('id', analysisJobId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        console.error('[integrations-sync] Phase 3 error:', message);
        await admin.schema('app').from('integration_sync_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          progress: { phase_label: `Snapshot rebuild failed: ${message}` },
          error_log: { message, timestamp: new Date().toISOString() },
        }).eq('id', analysisJobId);
      }
    }

    await setIntegrationStatus(admin, integration.id, 'connected');

    return json({
      ok: true,
      status: 'complete',
      job_ids: jobIds,
      results,
    });
  } catch (err) {
    console.error('[integrations-sync]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Sync failed' }, 500);
  }
});
