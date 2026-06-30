/**
 * sync-utils.ts
 * Shared utilities for sequential per-entity sync-* Edge Functions.
 * Each sync-{entity} function imports from here instead of the monolithic runtime.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { ZohoIntegrationTypeId } from '../../../src/lib/integrations/contracts.ts';
import { ZOHO_INTEGRATION_TYPE_IDS } from '../../../src/lib/integrations/contracts.ts';
import type { IntegrationSyncPhaseDefinition } from './integrations-zoho.ts';
import { createZohoAdapter } from './integrations-zoho.ts';
import { persistZohoEntityPage } from './integrations-persist.ts';
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

interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  vault_secret_id: string | null;
  status: string;
}

export async function loadTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, vault_secret_id, status')
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
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: patch.status,
    updated_at: new Date().toISOString(),
  };

  if (patch.records_synced !== undefined) update.records_synced = patch.records_synced;
  if (patch.started_at !== undefined) update.started_at = patch.started_at;
  if (patch.completed_at !== undefined) update.completed_at = patch.completed_at;
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

export async function setIntegrationSyncFailed(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status: 'sync_failed', updated_at: new Date().toISOString() })
    .eq('id', integrationId);
}

// ── Core sync loop ────────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;
const DEFAULT_PER_PAGE = 200;

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
  } = {},
): Promise<SyncResult> {
  const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
  const adapter = createZohoAdapter(zohoTypeId, credentials);

  const startedAt = new Date().toISOString();
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
  let pagesFetched = 0;
  const pageLimit = DEFAULT_PAGE_LIMIT;

  while (pagesFetched < pageLimit) {
    const page = await adapter.fetchPhasePage(phase, cursor, opts.since ?? null);

    if (page.records.length > 0) {
      const result: PersistResult = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        null,
        integration.id,
        phase.entityType,
        zohoTypeId,
        page.records,
        adapter,
      );
      totalSynced += result.created + result.updated;
    }

    pagesFetched++;

    if (!page.hasMore || !page.nextCursor) {
      if (opts.jobId) {
        await updatePhaseJob(admin, opts.jobId, {
          status: 'completed',
          records_synced: totalSynced,
          completed_at: new Date().toISOString(),
          progress: { pages_fetched: pagesFetched },
        });
      }
      return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: false, next_cursor: null };
    }

    cursor = page.nextCursor;
  }

  // Hit page limit — return resume cursor
  const nextCursorRecord = cursor as Record<string, unknown> | null;
  if (opts.jobId) {
    await updatePhaseJob(admin, opts.jobId, {
      status: 'paused',
      records_synced: totalSynced,
      next_cursor: nextCursorRecord,
      progress: { pages_fetched: pagesFetched },
    });
  }
  return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: true, next_cursor: nextCursorRecord };
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
