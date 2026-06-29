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
  opts: { tenantId: string; tenantIntegrationId: string; phase: string; jobType: string; triggeredBy: string | null },
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
      progress: {},
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
  const url = `${getFunctionsBaseUrl()}/sync-${opts.phase}`;
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

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
    if (!tenantIntegrationId) return json({ ok: false, error: 'tenant_integration_id is required' }, 400);

    // Resolve which phases to run
    const requestedPhase = typeof body.phase === 'string' ? body.phase as PhaseName : null;
    const pageFrom = typeof body.page_from === 'number' ? body.page_from : null;
    const since = typeof body.since === 'string' ? body.since : null;
    const jobType = typeof body.job_type === 'string' ? body.job_type : 'manual';

    const phasesToRun: PhaseName[] = requestedPhase
      ? [requestedPhase]
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

    // Mark integration as syncing
    await setIntegrationStatus(admin, integration.id, 'syncing');

    // Create one pending job row per phase upfront — frontend can subscribe to these
    const jobIds: Record<string, string> = {};
    for (const phase of phasesToRun) {
      jobIds[phase] = await createPhaseJob(admin, {
        tenantId: integration.tenant_id,
        tenantIntegrationId: integration.id,
        phase,
        jobType,
        triggeredBy: actorUserId,
      });
    }

    // Run phases sequentially — one must complete before the next starts
    const results: PhaseResult[] = [];

    for (const phase of phasesToRun) {
      try {
        const result = await dispatchPhase({
          phase,
          tenantIntegrationId: integration.id,
          jobId: jobIds[phase],
          // Only apply page_from to the first (or only) phase — resume is per-phase
          pageFrom: phase === requestedPhase ? pageFrom : null,
          since,
        });

        results.push(result);

        if (result.has_more) {
          // Phase hit page limit — return early, caller must resume this phase
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
              page_from: (result.next_cursor as { page?: number } | null)?.page ?? null,
              next_cursor: result.next_cursor,
            },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await markJobFailed(admin, jobIds[phase], message);
        await setIntegrationStatus(admin, integration.id, 'sync_failed');

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

    // All phases complete
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
