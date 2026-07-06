/**
 * sync-utils.ts
 * Shared utilities for sequential per-entity sync-* Edge Functions.
 * Each sync-{entity} function imports from here instead of the monolithic runtime.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { ZohoIntegrationTypeId } from '../../../src/lib/integrations/contracts.ts';
import { ZOHO_INTEGRATION_TYPE_IDS } from '../../../src/lib/integrations/contracts.ts';
import type { IntegrationSyncPhaseDefinition, ZohoTokenCacheProvider } from './integrations-zoho.ts';
import { createZohoAdapter } from './integrations-zoho.ts';
import {
  persistZohoEntityPage,
  rebuildBuyerSearchVectors,
  rebuildBuyerUserSearchVectors,
} from './integrations-persist.ts';
import type { PersistResult } from './integrations-persist.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  phase: string;
  records_synced: number;
  has_more: boolean;
  next_cursor: Record<string, unknown> | null;
}

export interface SyncRequest {
  tenant_integration_id: string;
  job_id?: string | null;
  page_from?: number | null;
  per_page?: number | null;
  since?: string | null;
}

// ── Environment ─────────────────────────────────────────────────────────────

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getFunctionsBaseUrl(): string {
  const configured = Deno.env.get('INTEGRATIONS_FUNCTIONS_BASE_URL');
  const base = configured ?? `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1`;
  return base.replace(/\/+$/, '');
}

export function getDispatchSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_DISPATCH_SECRET') ?? null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function isAuthorizedInternal(req: Request): boolean {
  const secret = getDispatchSecret();
  if (!secret) return false;
  return req.headers.get('x-integrations-dispatch-secret') === secret;
}

// ── Integration loading ───────────────────────────────────────────────────────

export interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  vault_secret_id: string | null;
  status: string;
  connected_by: string | null;
}

export function resolveSyncImportActorId(
  integration: Pick<TenantIntegrationRow, 'connected_by'>,
  explicitActorId?: string | null,
): string | null {
  return explicitActorId ?? integration.connected_by ?? null;
}

export async function loadTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, vault_secret_id, status, connected_by')
    .eq('id', tenantIntegrationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load tenant integration: ${error.message}`);
  if (!data) throw new Error('Tenant integration not found');
  return data as TenantIntegrationRow;
}

export async function loadIntegrationCredentials(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  integrationTypeId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: tenantIntegrationId,
      p_expected_integration_type_id: integrationTypeId,
    });

  if (error) throw new Error(`Unable to load integration secret: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('No integration secret configured');
  return data as Record<string, unknown>;
}

export function assertZohoIntegration(integrationTypeId: string): ZohoIntegrationTypeId {
  if (!(ZOHO_INTEGRATION_TYPE_IDS as readonly string[]).includes(integrationTypeId)) {
    throw new Error(`Unsupported integration type: ${integrationTypeId}`);
  }
  return integrationTypeId as ZohoIntegrationTypeId;
}

// ── Job tracking ──────────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export async function upsertPhaseJob(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    phase: string;
    jobType: string;
    triggeredBy: string | null;
    sinceDate?: string | null;
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
      progress: {},
      since_date: opts.sinceDate ?? null,
      triggered_by: opts.triggeredBy ?? null,
      created_by: opts.triggeredBy ?? null,
      updated_by: opts.triggeredBy ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Unable to create phase sync job: ${error.message}`);
  return data.id as string;
}

export async function updatePhaseJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  patch: {
    status: JobStatus;
    records_synced?: number;
    next_cursor?: Record<string, unknown> | null;
    error_message?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    progress?: Record<string, unknown>;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: patch.status,
    updated_at: new Date().toISOString(),
  };

  if (patch.records_synced !== undefined) update.records_synced = patch.records_synced;
  if (patch.started_at !== undefined) update.started_at = patch.started_at;
  if (patch.completed_at !== undefined) update.completed_at = patch.completed_at;
  if (patch.summary !== undefined) update.summary = patch.summary;

  if (patch.progress !== undefined) update.progress = patch.progress;

  if (patch.next_cursor !== undefined) {
    update.progress = { ...(patch.progress ?? {}), next_cursor: patch.next_cursor };
  }

  if (patch.error_message) {
    update.error_log = { message: patch.error_message, timestamp: new Date().toISOString() };
  }

  await admin.schema('app').from('integration_sync_jobs').update(update).eq('id', jobId);
}

// ── Tenant integration status ─────────────────────────────────────────────────

export async function setIntegrationSyncing(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status: 'syncing', updated_at: new Date().toISOString() })
    .eq('id', integrationId);
}

export async function setIntegrationConnected(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status: 'connected', updated_at: new Date().toISOString() })
    .eq('id', integrationId);
}

/** Sync failures are recorded on app.integration_sync_jobs — OAuth stays connected. */
export async function setIntegrationSyncFailed(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await setIntegrationConnected(admin, integrationId);
}

// ── DB-backed Zoho token cache ─────────────────────────────────────────────────

export function createDbTokenCache(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): ZohoTokenCacheProvider {
  return {
    async read(): Promise<string | null> {
      const { data } = await admin
        .schema('app')
        .from('zoho_token_cache')
        .select('access_token, expires_at')
        .eq('tenant_integration_id', tenantIntegrationId)
        .maybeSingle();
      if (!data?.access_token) return null;
      // Require at least 60s of remaining validity
      const expiresAt = new Date(data.expires_at as string).getTime();
      if (Date.now() > expiresAt - 60_000) return null;
      return data.access_token as string;
    },
    async write(token: string, expiresAt: Date): Promise<void> {
      await admin
        .schema('app')
        .from('zoho_token_cache')
        .upsert(
          {
            tenant_integration_id: tenantIntegrationId,
            access_token: token,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_integration_id' },
        );
    },
  };
}

// ── Core sync loop ────────────────────────────────────────────────────────────

// Each sync-* Edge Function invocation runs for up to 120s before returning a
// resume cursor. Supabase hard limit is ~150s — 30s safety buffer. Now safe to
// raise from the previous 100s because the orchestrator no longer re-dispatches
// the SAME phase a second time within one invocation (that used to compound
// two ~100s calls past the platform's hard limit and get force-killed mid-call
// — see the comment in integrations-sync/index.ts). A single call using more
// of its own budget now gets strictly more real work done per invocation.
const TIME_BUDGET_MS = 120_000;
const DEFAULT_PER_PAGE = 200;

// Converts snake_case entity type to Title Case label
function labelizeEntity(value: string): string {
  if (value === 'orders') return 'Sales Orders';
  return value.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Maps entity type to its phase group for the 3-phase UI model
function getPhaseGroup(entityType: string): { group: string; groupLabel: string } {
  if (['locations', 'products', 'pricelists', 'customers'].includes(entityType)) {
    return { group: 'reference', groupLabel: 'Reference Data' };
  }
  if (['estimates', 'orders', 'invoices', 'transaction_line_items'].includes(entityType)) {
    return { group: 'transactional', groupLabel: 'Transactions' };
  }
  return { group: 'analysis', groupLabel: 'Analysis' };
}

export async function runPhaseSync(
  admin: ReturnType<typeof createAdminClient>,
  integration: TenantIntegrationRow,
  credentials: Record<string, unknown>,
  phase: IntegrationSyncPhaseDefinition,
  opts: {
    jobId?: string | null;
    pageFrom?: number | null;
    perPage?: number | null;
    since?: string | null;
    jobType?: string | null;
  } = {},
): Promise<SyncResult> {
  const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
  const tokenCache = createDbTokenCache(admin, integration.id);
  const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache);

  const startedAt = new Date().toISOString();
  const budgetStart = Date.now();
  const { group: phaseGroup, groupLabel: phaseGroupLabel } = getPhaseGroup(phase.entityType);
  if (opts.jobId) {
    await updatePhaseJob(admin, opts.jobId, { status: 'running', started_at: startedAt });
  }

  let cursor = opts.pageFrom && opts.pageFrom > 1
    ? {
        phase: phase.id,
        entity_type: phase.entityType,
        page: opts.pageFrom,
        per_page: opts.perPage ?? DEFAULT_PER_PAGE,
        has_more: true,
        since: opts.since ?? null,
      }
    : null;

  let totalSynced = 0;
  let totalFailed = 0;
  let pagesFetched = 0;

  // Accumulated across pages — rebuilt once at invocation end instead of after every page
  const allBuyerIds: string[] = [];
  const allBuyerUserIds: string[] = [];

  // Build the progress object written after every page
  function buildProgress(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      phase: phase.entityType,
      phase_label: labelizeEntity(phase.entityType),
      phase_group: phaseGroup,
      phase_group_label: phaseGroupLabel,
      phases: [phase.entityType],
      pages_fetched: pagesFetched,
      records_synced: totalSynced,
      items_processed: totalSynced + totalFailed,
      counts: {
        [phase.entityType]: {
          entity_type: phase.entityType,
          processed: totalSynced,
          failed: totalFailed,
          pages: pagesFetched,
        },
      },
      ...extra,
    };
  }

  while (true) {
    // Time-budget check: stop before Supabase's 150s hard limit
    if (Date.now() - budgetStart > TIME_BUDGET_MS) break;

    const page = await adapter.fetchPhasePage(phase, cursor, opts.since ?? null, opts.jobType ?? undefined);

    if (page.records.length > 0) {
      const importActorId = resolveSyncImportActorId(integration);
      const result: PersistResult = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        importActorId,
        integration.id,
        phase.entityType,
        zohoTypeId,
        page.records,
        adapter,
      );
      const pageSynced = result.created + result.updated;
      totalSynced += pageSynced;
      // Records not created/updated/skipped are treat as failed
      totalFailed += Math.max(0, page.records.length - pageSynced - result.skipped);

      if (result.pendingSearchVectorBuyerIds.length > 0) {
        allBuyerIds.push(...result.pendingSearchVectorBuyerIds);
      }
      if (result.pendingSearchVectorBuyerUserIds.length > 0) {
        allBuyerUserIds.push(...result.pendingSearchVectorBuyerUserIds);
      }
    }

    pagesFetched++;

    // Write progress after every page so UI updates within ~1s (via Realtime)
    if (opts.jobId) {
      await updatePhaseJob(admin, opts.jobId, {
        status: 'running',
        records_synced: totalSynced,
        progress: buildProgress(),
      });
    }

    if (!page.hasMore || !page.nextCursor) {
      const completedAt = new Date().toISOString();
      if (opts.jobId) {
        const durationMs = Date.now() - new Date(startedAt).getTime();
        await updatePhaseJob(admin, opts.jobId, {
          status: 'completed',
          records_synced: totalSynced,
          completed_at: completedAt,
          progress: buildProgress(),
          summary: {
            since: opts.since ?? null,
            phases_completed: [phase.entityType],
            counts: {
              [phase.entityType]: {
                entity_type: phase.entityType,
                processed: totalSynced,
                failed: totalFailed,
                pages: pagesFetched,
              },
            },
            last_synced_at: completedAt,
            note: `${labelizeEntity(phase.entityType)}: ${totalSynced} synced${totalFailed > 0 ? `, ${totalFailed} failed` : ''} across ${pagesFetched} page${pagesFetched !== 1 ? 's' : ''}`,
            duration_ms: durationMs,
            total_processed: totalSynced,
            total_failed: totalFailed,
          },
        });
      }
      flushBuyerSearchVectorsInBackground(admin, integration.tenant_id, allBuyerIds, allBuyerUserIds);
      return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: false, next_cursor: null };
    }

    cursor = page.nextCursor;
  }

  // Time budget exceeded — pause first, rebuild accumulated search vectors in background
  const nextCursorRecord = cursor as Record<string, unknown> | null;
  if (opts.jobId) {
    await updatePhaseJob(admin, opts.jobId, {
      status: 'paused',
      records_synced: totalSynced,
      next_cursor: nextCursorRecord,
      progress: buildProgress({ next_cursor: nextCursorRecord }),
    });
  }
  flushBuyerSearchVectorsInBackground(admin, integration.tenant_id, allBuyerIds, allBuyerUserIds);
  return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: true, next_cursor: nextCursorRecord };
}

// ── Search vector flush ───────────────────────────────────────────────────────

// No-op for non-customer phases (arrays will be empty)
async function flushBuyerSearchVectors(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  buyerIds: string[],
  buyerUserIds: string[],
): Promise<void> {
  if (buyerIds.length > 0) {
    await rebuildBuyerSearchVectors(admin, tenantId, buyerIds);
  }
  if (buyerUserIds.length > 0) {
    await rebuildBuyerUserSearchVectors(admin, buyerIds, buyerUserIds);
  }
}

// Search vectors are a read-side optimization, not sync-correctness — a slow or
// failing rebuild must never block the phase's completed/paused status write, or
// throw and abandon the job at status='running' (see reap_stale_sync_jobs).
// Runs after the job status is already persisted, via EdgeRuntime.waitUntil so
// it still completes after the response returns instead of being cut off.
function flushBuyerSearchVectorsInBackground(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  buyerIds: string[],
  buyerUserIds: string[],
): void {
  if (buyerIds.length === 0 && buyerUserIds.length === 0) return;
  const task = flushBuyerSearchVectors(admin, tenantId, buyerIds, buyerUserIds).catch((err) => {
    console.error('[sync] buyer search vector rebuild failed (non-fatal, phase already completed):', err);
  });
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  edgeRuntime?.waitUntil(task);
}

// ── Response helpers ──────────────────────────────────────────────────────────

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

export async function parseSyncRequest(req: Request): Promise<SyncRequest> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
  if (!tenantIntegrationId) throw new Error('tenant_integration_id is required');
  return {
    tenant_integration_id: tenantIntegrationId,
    job_id: typeof body.job_id === 'string' ? body.job_id : null,
    page_from: typeof body.page_from === 'number' ? body.page_from : null,
    per_page: typeof body.per_page === 'number' ? body.per_page : null,
    since: typeof body.since === 'string' ? body.since : null,
  };
}
