import { createClient } from 'npm:@supabase/supabase-js@2';
import type {
  IntegrationConnectRequest,
  IntegrationJobProgress,
  IntegrationJobSummary,
  IntegrationSyncPhaseStats,
  IntegrationSyncRequest,
  IntegrationSyncScope,
  IntegrationTestRequest,
  IntegrationTypeId,
  IntegrationWebhookRequest,
  IntegrationWorkerDispatchRequest,
  ZohoIntegrationTypeId,
} from '../../../src/lib/integrations/contracts.ts';
import {
  INTEGRATION_JOB_TYPES,
  ZOHO_INTEGRATION_TYPE_IDS,
} from '../../../src/lib/integrations/contracts.ts';
import {
  createZohoAdapter,
  getZohoPhasePlan,
  sampleExternalIds,
  type IntegrationSyncPhaseDefinition,
  ZohoApiError,
} from './integrations-zoho.ts';

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

type JsonRecord = Record<string, unknown>;

type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];

type TenantIntegrationStatus =
  | 'pending_setup'
  | 'connected'
  | 'syncing'
  | 'sync_failed'
  | 'disconnected';

type IntegrationHealthStatus = 'ok' | 'expired' | 'invalid' | null;

interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: IntegrationTypeId;
  status: TenantIntegrationStatus;
  vault_secret_id: string | null;
  config: JsonRecord;
  last_health_check_at: string | null;
  health_status: IntegrationHealthStatus;
  connected_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  external_ref: string | null;
}

interface IntegrationSyncJobRow {
  id: string;
  tenant_id: string;
  tenant_integration_id: string;
  job_type: IntegrationJobType;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: JsonRecord;
  error_log: JsonRecord | null;
  summary: JsonRecord | null;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  external_ref: string | null;
}

interface IntegrationWebhookRow {
  id: string;
  tenant_id: string;
  tenant_integration_id: string;
  endpoint_token: string;
  event_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  external_ref: string | null;
}

interface ActorContext {
  userId: string;
  authHeader: string | null;
  internal: boolean;
}

interface WorkerExecutionResult {
  jobId: string;
  status: 'completed' | 'running' | 'noop';
  continuationDispatched: boolean;
  progress: IntegrationJobProgress;
  summary: IntegrationJobSummary | null;
}

class HttpError extends Error {
  status: number;
  details?: JsonRecord;

  constructor(status: number, message: string, details?: JsonRecord) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_PAGE_LIMIT = 5;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asJsonRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(status: number, message: string, details?: JsonRecord): Response {
  return jsonResponse({ ok: false, error: message, ...(details ? { details } : {}) }, status);
}

function scrubSecretValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => scrubSecretValue(entry));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const normalized = key.toLowerCase();
      if (
        normalized.includes('secret')
        || normalized.includes('token')
        || normalized.includes('password')
      ) {
        return [key, '***'];
      }
      return [key, scrubSecretValue(entry)];
    }),
  );
}

function isZohoIntegrationTypeId(value: string): value is ZohoIntegrationTypeId {
  return (ZOHO_INTEGRATION_TYPE_IDS as readonly string[]).includes(value);
}

function normalizeJobType(value: unknown): IntegrationJobType {
  if (typeof value === 'string' && (INTEGRATION_JOB_TYPES as readonly string[]).includes(value)) {
    return value as IntegrationJobType;
  }
  return 'manual';
}

function resolveScope(jobType: IntegrationJobType, requestedScope: unknown): IntegrationSyncScope {
  if (requestedScope === 'reference' || requestedScope === 'transactional' || requestedScope === 'full') {
    return requestedScope;
  }

  if (jobType === 'initial_reference') return 'reference';
  if (jobType === 'initial_transactional' || jobType === 'incremental') return 'transactional';
  return 'full';
}

function normalizeSince(value: unknown): string | null {
  const since = asString(value);
  if (!since) return null;
  const parsed = new Date(since);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizePageLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envValue = Deno.env.get('INTEGRATIONS_WORKER_PAGE_LIMIT');
  const parsedEnv = envValue ? Number.parseInt(envValue, 10) : Number.NaN;
  return Number.isFinite(parsedEnv) && parsedEnv > 0 ? parsedEnv : DEFAULT_PAGE_LIMIT;
}

function getSupabaseUrl(): string {
  const value = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  if (!value) throw new HttpError(500, 'Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.');
  return value.replace(/\/+$/, '');
}

function getSupabaseServiceKey(): string {
  const value = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!value) throw new HttpError(500, 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.');
  return value;
}

function getFunctionsBaseUrl(): string {
  const configured = Deno.env.get('INTEGRATIONS_FUNCTIONS_BASE_URL');
  const base = configured ? configured.replace(/\/+$/, '') : `${getSupabaseUrl()}/functions/v1`;
  return base.endsWith('/functions/v1') ? base : `${base}/functions/v1`;
}

function getDispatchSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_DISPATCH_SECRET') ?? null;
}

function createAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const payload = await request.json().catch(() => {
    throw new HttpError(400, 'Request body must be valid JSON.');
  });
  return payload as T;
}

function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, `Method ${request.method} not allowed.`);
  }
}

function getBearerHeader(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization : null;
}

function hasValidDispatchSecret(request: Request): boolean {
  const expected = getDispatchSecret();
  const received = request.headers.get('x-integrations-dispatch-secret');
  return Boolean(expected && received && expected === received);
}

async function requireActor(request: Request, admin: ReturnType<typeof createAdminClient>): Promise<ActorContext> {
  if (hasValidDispatchSecret(request)) {
    return {
      userId: 'internal-dispatch',
      authHeader: getBearerHeader(request),
      internal: true,
    };
  }

  const authHeader = getBearerHeader(request);
  if (!authHeader) {
    throw new HttpError(401, 'Missing Bearer token.');
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, 'Unable to verify Supabase user token.');
  }

  return {
    userId: data.user.id,
    authHeader,
    internal: false,
  };
}

async function assertSellerAdmin(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('role', 'seller_admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, 'Unable to verify tenant membership.', { code: error.code ?? undefined });
  if (!data) throw new HttpError(403, 'Seller admin access required for this tenant.');
}

async function authorizeTenantActor(
  request: Request,
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<ActorContext> {
  const actor = await requireActor(request, admin);
  if (!actor.internal) {
    await assertSellerAdmin(admin, tenantId, actor.userId);
  }
  return actor;
}

async function loadTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('*')
    .eq('id', tenantIntegrationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new HttpError(500, 'Unable to load tenant integration.', { code: error.code ?? undefined });
  if (!data) throw new HttpError(404, 'Tenant integration not found.');
  return data as TenantIntegrationRow;
}

async function findTenantIntegrationByType(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  integrationTypeId: IntegrationTypeId,
): Promise<TenantIntegrationRow | null> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('integration_type_id', integrationTypeId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new HttpError(500, 'Unable to look up tenant integration.', { code: error.code ?? undefined });
  return data ? (data as TenantIntegrationRow) : null;
}

async function ensureTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  integrationTypeId: IntegrationTypeId,
  actorUserId: string,
  requestedId?: string | null,
): Promise<TenantIntegrationRow> {
  if (requestedId) {
    const row = await loadTenantIntegration(admin, requestedId);
    if (row.tenant_id !== tenantId || row.integration_type_id !== integrationTypeId) {
      throw new HttpError(409, 'Requested tenant integration does not match tenant_id and integration_type_id.');
    }
    return row;
  }

  const existing = await findTenantIntegrationByType(admin, tenantId, integrationTypeId);
  if (existing) return existing;

  const payload = {
    tenant_id: tenantId,
    integration_type_id: integrationTypeId,
    status: 'pending_setup',
    config: {},
    created_by: actorUserId,
    updated_by: actorUserId,
  };

  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new HttpError(500, 'Unable to create tenant integration.', { code: error.code ?? undefined });
  return data as TenantIntegrationRow;
}

async function updateTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  patch: Partial<TenantIntegrationRow>,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .update(patch)
    .eq('id', tenantIntegrationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, 'Unable to update tenant integration.', { code: error.code ?? undefined });
  return data as TenantIntegrationRow;
}

async function storeTenantIntegrationSecret(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  actorUserId: string,
  secret: JsonRecord,
): Promise<void> {
  const { error } = await admin
    .schema('app')
    .rpc('upsert_tenant_integration_secret', {
      p_tenant_integration_id: tenantIntegrationId,
      p_actor_user_id: actorUserId,
      p_secret: secret,
      p_secret_name: null,
    });

  if (error) throw new HttpError(500, 'Unable to persist integration secret.', { code: error.code ?? undefined });
}

async function loadTenantIntegrationSecret(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<JsonRecord> {
  const { data, error } = await admin
    .schema('app')
    .rpc('get_tenant_integration_secret', {
      p_tenant_integration_id: tenantIntegrationId,
    });

  if (error) throw new HttpError(500, 'Unable to retrieve integration secret.', { code: error.code ?? undefined });
  if (!isRecord(data)) throw new HttpError(400, 'No integration secret is configured for this tenant integration.');
  return data;
}

async function createSyncJob(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    tenantId: string;
    tenantIntegrationId: string;
    jobType: IntegrationJobType;
    triggeredBy: string | null;
    progress: IntegrationJobProgress;
  },
): Promise<IntegrationSyncJobRow> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .insert({
      tenant_id: input.tenantId,
      tenant_integration_id: input.tenantIntegrationId,
      job_type: input.jobType,
      status: 'queued',
      progress: input.progress,
      triggered_by: input.triggeredBy,
      created_by: input.triggeredBy,
      updated_by: input.triggeredBy,
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, 'Unable to create integration sync job.', { code: error.code ?? undefined });
  return data as IntegrationSyncJobRow;
}

async function loadSyncJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
): Promise<IntegrationSyncJobRow> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new HttpError(500, 'Unable to load integration sync job.', { code: error.code ?? undefined });
  if (!data) throw new HttpError(404, 'Integration sync job not found.');
  return data as IntegrationSyncJobRow;
}

async function updateSyncJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  patch: Partial<IntegrationSyncJobRow>,
): Promise<IntegrationSyncJobRow> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, 'Unable to update integration sync job.', { code: error.code ?? undefined });
  return data as IntegrationSyncJobRow;
}

async function appendJobError(
  admin: ReturnType<typeof createAdminClient>,
  job: IntegrationSyncJobRow,
  error: unknown,
): Promise<void> {
  const now = nowIso();
  const existingEntries = Array.isArray(job.error_log?.entries) ? job.error_log?.entries : [];
  const nextEntries = [
    ...existingEntries,
    {
      timestamp: now,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(error instanceof ZohoApiError && error.code !== undefined ? { code: error.code } : {}),
    },
  ];

  const progress = isRecord(job.progress) ? (job.progress as unknown as IntegrationJobProgress) : null;
  const failedProgress = progress
    ? {
      ...progress,
      updated_at: now,
      note: error instanceof Error ? error.message : progress.note,
    }
    : undefined;

  await updateSyncJob(admin, job.id, {
    status: 'failed',
    completed_at: now,
    error_log: {
      entries: nextEntries,
    },
    ...(failedProgress ? { progress: asJsonRecord(failedProgress) } : {}),
  });
}

function buildProgressCounts(plan: IntegrationSyncPhaseDefinition[]): Record<string, IntegrationSyncPhaseStats> {
  return Object.fromEntries(
    plan.map((phase) => [
      phase.id,
      {
        entity_type: phase.entityType,
        processed: 0,
        failed: 0,
        pages: 0,
      },
    ]),
  );
}

function buildInitialProgress(
  scope: IntegrationSyncScope,
  since: string | null,
  plan: IntegrationSyncPhaseDefinition[],
  note?: string,
): IntegrationJobProgress {
  const first = plan[0] ?? null;
  const startedAt = nowIso();

  return {
    version: 1,
    provider: 'zoho',
    scope,
    since,
    phases: plan.map((phase) => phase.id),
    phases_total: plan.length,
    phase_current: first ? 1 : 0,
    phase: first?.id ?? null,
    phase_label: first?.label ?? null,
    items_processed: 0,
    items_failed: 0,
    items_total: null,
    pages_processed: 0,
    cursor: first
      ? {
        phase: first.id,
        entity_type: first.entityType,
        page: 1,
        per_page: first.perPage ?? 200,
        has_more: true,
        since,
      }
      : null,
    counts: buildProgressCounts(plan),
    started_at: startedAt,
    updated_at: startedAt,
    ...(note ? { note } : {}),
  };
}

function hydrateProgress(
  raw: unknown,
  scope: IntegrationSyncScope,
  since: string | null,
  plan: IntegrationSyncPhaseDefinition[],
): IntegrationJobProgress {
  if (!isRecord(raw)) return buildInitialProgress(scope, since, plan);

  const fallback = buildInitialProgress(scope, since, plan);
  const counts = buildProgressCounts(plan);
  const rawCounts = isRecord(raw.counts) ? raw.counts : {};

  for (const [phaseId, value] of Object.entries(rawCounts)) {
    if (!isRecord(value) || !counts[phaseId]) continue;
    counts[phaseId] = {
      entity_type: asString(value.entity_type) ?? counts[phaseId].entity_type,
      processed: typeof value.processed === 'number' ? value.processed : counts[phaseId].processed,
      failed: typeof value.failed === 'number' ? value.failed : counts[phaseId].failed,
      pages: typeof value.pages === 'number' ? value.pages : counts[phaseId].pages,
    };
  }

  const phase = asString(raw.phase);
  const phaseDefinition = phase ? plan.find((entry) => entry.id === phase) ?? null : null;
  const rawCursor = isRecord(raw.cursor) ? raw.cursor : null;
  const cursor = phaseDefinition
    ? {
      phase: phaseDefinition.id,
      entity_type: asString(rawCursor?.entity_type) ?? phaseDefinition.entityType,
      page: typeof rawCursor?.page === 'number' ? rawCursor.page : 1,
      per_page: typeof rawCursor?.per_page === 'number'
        ? rawCursor.per_page
        : (phaseDefinition.perPage ?? 200),
      has_more: typeof rawCursor?.has_more === 'boolean' ? rawCursor.has_more : true,
      since: normalizeSince(rawCursor?.since) ?? since,
    }
    : null;

  return {
    ...fallback,
    phase: phaseDefinition?.id ?? fallback.phase,
    phase_label: phaseDefinition?.label ?? fallback.phase_label,
    phase_current: phaseDefinition ? (plan.findIndex((entry) => entry.id === phaseDefinition.id) + 1) : fallback.phase_current,
    items_processed: typeof raw.items_processed === 'number' ? raw.items_processed : fallback.items_processed,
    items_failed: typeof raw.items_failed === 'number' ? raw.items_failed : fallback.items_failed,
    items_total: typeof raw.items_total === 'number' ? raw.items_total : fallback.items_total,
    pages_processed: typeof raw.pages_processed === 'number' ? raw.pages_processed : fallback.pages_processed,
    counts,
    cursor,
    started_at: asString(raw.started_at) ?? fallback.started_at,
    updated_at: asString(raw.updated_at) ?? fallback.updated_at,
    note: asString(raw.note) ?? fallback.note,
    last_page: isRecord(raw.last_page)
      ? {
        phase: asString(raw.last_page.phase) ?? fallback.phase ?? '',
        count: typeof raw.last_page.count === 'number' ? raw.last_page.count : 0,
        next_page: typeof raw.last_page.next_page === 'number' ? raw.last_page.next_page : null,
        completed_at: asString(raw.last_page.completed_at) ?? fallback.updated_at,
        sample_ids: Array.isArray(raw.last_page.sample_ids)
          ? raw.last_page.sample_ids.filter((value): value is string => typeof value === 'string')
          : undefined,
      }
      : undefined,
  };
}

function moveToNextPhase(
  progress: IntegrationJobProgress,
  plan: IntegrationSyncPhaseDefinition[],
): IntegrationJobProgress {
  if (!progress.phase) return progress;
  const currentIndex = plan.findIndex((phase) => phase.id === progress.phase);
  const nextPhase = currentIndex >= 0 ? plan[currentIndex + 1] ?? null : null;
  const updatedAt = nowIso();

  if (!nextPhase) {
    return {
      ...progress,
      phase: null,
      phase_label: null,
      phase_current: progress.phases_total,
      cursor: null,
      updated_at: updatedAt,
    };
  }

  return {
    ...progress,
    phase: nextPhase.id,
    phase_label: nextPhase.label,
    phase_current: currentIndex + 2,
    cursor: {
      phase: nextPhase.id,
      entity_type: nextPhase.entityType,
      page: 1,
      per_page: nextPhase.perPage ?? 200,
      has_more: true,
      since: progress.since,
    },
    updated_at: updatedAt,
  };
}

function applyPhasePage(
  progress: IntegrationJobProgress,
  plan: IntegrationSyncPhaseDefinition[],
  page: {
    phase: IntegrationSyncPhaseDefinition;
    records: JsonRecord[];
    nextCursor: IntegrationJobProgress['cursor'];
  },
): IntegrationJobProgress {
  const updatedAt = nowIso();
  const stats = progress.counts[page.phase.id] ?? {
    entity_type: page.phase.entityType,
    processed: 0,
    failed: 0,
    pages: 0,
  };

  const next: IntegrationJobProgress = {
    ...progress,
    phase: page.phase.id,
    phase_label: page.phase.label,
    phase_current: plan.findIndex((entry) => entry.id === page.phase.id) + 1,
    items_processed: progress.items_processed + page.records.length,
    pages_processed: progress.pages_processed + 1,
    counts: {
      ...progress.counts,
      [page.phase.id]: {
        ...stats,
        processed: stats.processed + page.records.length,
        pages: stats.pages + 1,
      },
    },
    cursor: page.nextCursor,
    updated_at: updatedAt,
    last_page: {
      phase: page.phase.id,
      count: page.records.length,
      next_page: page.nextCursor?.page ?? null,
      completed_at: updatedAt,
      sample_ids: sampleExternalIds(page.records),
    },
  };

  return page.nextCursor ? next : moveToNextPhase(next, plan);
}

function buildSummary(progress: IntegrationJobProgress): IntegrationJobSummary {
  return {
    provider: 'zoho',
    scope: progress.scope,
    since: progress.since,
    phases_completed: Object.keys(progress.counts).filter((key) => progress.counts[key].pages > 0 || progress.counts[key].processed > 0),
    counts: progress.counts,
    last_synced_at: nowIso(),
    note: progress.note,
  };
}

function classifyHealthStatus(error: unknown): IntegrationHealthStatus {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid_client') || message.includes('forbidden')) return 'invalid';
  if (message.includes('invalid oauth') || message.includes('invalid token') || message.includes('unauthorized')) return 'expired';
  return null;
}

function getDispatchHeaders(authHeader: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authHeader) headers.Authorization = authHeader;
  const dispatchSecret = getDispatchSecret();
  if (dispatchSecret) headers['x-integrations-dispatch-secret'] = dispatchSecret;
  return headers;
}

async function dispatchWorkerInvocation(
  authHeader: string | null,
  payload: IntegrationWorkerDispatchRequest,
): Promise<void> {
  const response = await fetch(`${getFunctionsBaseUrl()}/integrations-sync-worker`, {
    method: 'POST',
    headers: getDispatchHeaders(authHeader),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new HttpError(502, 'Failed to dispatch integrations-sync-worker.', {
      status: response.status,
      body,
    });
  }
}

function waitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(promise);
}

function createAdapterForIntegration(
  integration: TenantIntegrationRow,
  credentials: JsonRecord,
): ReturnType<typeof createZohoAdapter> {
  if (!isZohoIntegrationTypeId(integration.integration_type_id)) {
    throw new HttpError(501, `No runtime adapter is implemented for ${integration.integration_type_id}.`);
  }

  return createZohoAdapter(integration.integration_type_id, credentials);
}

async function runWorkerJob(
  request: Request,
  payload: IntegrationWorkerDispatchRequest,
): Promise<WorkerExecutionResult> {
  const admin = createAdminClient();
  const job = await loadSyncJob(admin, payload.job_id);
  const integration = await loadTenantIntegration(admin, job.tenant_integration_id);
  const actor = await authorizeTenantActor(request, admin, integration.tenant_id);

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    const scope = resolveScope(job.job_type, undefined);
    const plan = isZohoIntegrationTypeId(integration.integration_type_id)
      ? getZohoPhasePlan(integration.integration_type_id, scope)
      : [];
    const progress = hydrateProgress(job.progress, scope, normalizeSince((job.progress as JsonRecord)?.since), plan);
    return {
      jobId: job.id,
      status: 'noop',
      continuationDispatched: false,
      progress,
      summary: (job.summary as unknown as IntegrationJobSummary | null) ?? null,
    };
  }

  const credentials = await loadTenantIntegrationSecret(admin, integration.id);
  const adapter = createAdapterForIntegration(integration, credentials);
  const scope = resolveScope(job.job_type, (payload.progress as JsonRecord | null)?.scope);
  const since = normalizeSince((payload.progress as JsonRecord | null)?.since) ?? normalizeSince((job.progress as JsonRecord)?.since);
  const plan = getZohoPhasePlan(adapter.integrationTypeId, scope);
  let progress = hydrateProgress(payload.progress ?? job.progress, scope, since, plan);

  if (plan.length === 0) {
    progress = {
      ...progress,
      note: `No ${scope} Zoho runtime phases are currently wired for ${integration.integration_type_id}.`,
      phase: null,
      phase_label: null,
      phase_current: progress.phases_total,
      cursor: null,
      updated_at: nowIso(),
    };

    const summary = buildSummary(progress);
    await updateSyncJob(admin, job.id, {
      status: 'completed',
      progress: asJsonRecord(progress),
      summary: asJsonRecord(summary),
      started_at: job.started_at ?? progress.started_at,
      completed_at: nowIso(),
      updated_by: actor.internal ? null : actor.userId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: nowIso(),
      updated_by: actor.internal ? null : actor.userId,
    });

    return {
      jobId: job.id,
      status: 'completed',
      continuationDispatched: false,
      progress,
      summary,
    };
  }

  if (job.status !== 'running') {
    await updateSyncJob(admin, job.id, {
      status: 'running',
      started_at: job.started_at ?? nowIso(),
      progress: asJsonRecord(progress),
      updated_by: actor.internal ? null : actor.userId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'syncing',
      updated_by: actor.internal ? null : actor.userId,
    });
  }

  const pageLimit = normalizePageLimit(payload.page_limit);
  let processedPages = 0;

  while (processedPages < pageLimit && progress.phase) {
    const currentPhase = plan.find((phase) => phase.id === progress.phase);
    if (!currentPhase) {
      progress = moveToNextPhase(progress, plan);
      continue;
    }

    const cursor = progress.cursor?.phase === currentPhase.id
      ? progress.cursor
      : {
        phase: currentPhase.id,
        entity_type: currentPhase.entityType,
        page: 1,
        per_page: currentPhase.perPage ?? 200,
        has_more: true,
        since: progress.since,
      };

    const page = await adapter.fetchPhasePage(currentPhase, cursor, progress.since);
    progress = applyPhasePage(progress, plan, {
      phase: currentPhase,
      records: page.records,
      nextCursor: page.nextCursor,
    });

    await updateSyncJob(admin, job.id, {
      progress: asJsonRecord(progress),
      status: 'running',
      updated_by: actor.internal ? null : actor.userId,
    });

    processedPages += 1;
  }

  if (!progress.phase) {
    const summary = buildSummary(progress);
    await updateSyncJob(admin, job.id, {
      status: 'completed',
      progress: asJsonRecord(progress),
      summary: asJsonRecord(summary),
      completed_at: nowIso(),
      updated_by: actor.internal ? null : actor.userId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: nowIso(),
      updated_by: actor.internal ? null : actor.userId,
    });

    return {
      jobId: job.id,
      status: 'completed',
      continuationDispatched: false,
      progress,
      summary,
    };
  }

  let continuationDispatched = false;
  try {
    if (actor.authHeader || getDispatchSecret()) {
      await dispatchWorkerInvocation(actor.authHeader, {
        job_id: job.id,
        tenant_integration_id: integration.id,
        continuation: true,
        reason: 'page_limit_reached',
        progress: asJsonRecord(progress),
      });
      continuationDispatched = true;
    } else {
      progress = {
        ...progress,
        note: 'Worker paused because no dispatch auth was available for automatic continuation.',
        updated_at: nowIso(),
      };
      await updateSyncJob(admin, job.id, {
        progress: asJsonRecord(progress),
        updated_by: actor.internal ? null : actor.userId,
      });
    }
  } catch (error) {
    progress = {
      ...progress,
      note: error instanceof Error ? error.message : progress.note,
      updated_at: nowIso(),
    };
    await updateSyncJob(admin, job.id, {
      progress: asJsonRecord(progress),
      updated_by: actor.internal ? null : actor.userId,
    });
    throw error;
  }

  return {
    jobId: job.id,
    status: 'running',
    continuationDispatched,
    progress,
    summary: null,
  };
}

function describeConnectionMeta(meta: JsonRecord, existingConfig: JsonRecord): JsonRecord {
  return {
    ...existingConfig,
    organization_id: asString(meta.organization_id),
    organization_name: asString(meta.organization_name),
    provider: 'zoho',
    module: asString(meta.module),
    transport: {
      api_base_url: asString(meta.api_base_url),
      accounts_base_url: asString(meta.accounts_base_url),
    },
  };
}

export async function handleIntegrationsConnect(request: Request): Promise<Response> {
  try {
    requireMethod(request, 'POST');
    const payload = await readJson<IntegrationConnectRequest>(request);

    if (!asString(payload.tenant_id) || !asString(payload.integration_type_id) || !isRecord(payload.credentials)) {
      throw new HttpError(400, 'tenant_id, integration_type_id, and credentials are required.');
    }

    const admin = createAdminClient();
    const actor = await authorizeTenantActor(request, admin, payload.tenant_id);
    const integrationTypeId = payload.integration_type_id;

    if (!isZohoIntegrationTypeId(integrationTypeId)) {
      throw new HttpError(501, `Only Zoho runtime connections are implemented right now. Received ${integrationTypeId}.`);
    }

    const adapter = createZohoAdapter(integrationTypeId, payload.credentials);
    const meta = await adapter.testConnection();
    const tenantIntegration = await ensureTenantIntegration(
      admin,
      payload.tenant_id,
      integrationTypeId,
      actor.userId,
      payload.tenant_integration_id,
    );

    await storeTenantIntegrationSecret(admin, tenantIntegration.id, actor.userId, payload.credentials);
    const config = describeConnectionMeta(meta as unknown as JsonRecord, isRecord(payload.config) ? payload.config : {});
    const updated = await updateTenantIntegration(admin, tenantIntegration.id, {
      status: 'connected',
      config,
      health_status: 'ok',
      last_health_check_at: nowIso(),
      connected_at: nowIso(),
      connected_by: actor.userId,
      updated_by: actor.userId,
    });

    return jsonResponse({
      ok: true,
      tenant_integration_id: updated.id,
      status: updated.status,
      health_status: updated.health_status,
      config: updated.config,
      meta,
    });
  } catch (error) {
    return handleRequestError(error);
  }
}

export async function handleIntegrationsTest(request: Request): Promise<Response> {
  try {
    requireMethod(request, 'POST');
    const payload = await readJson<IntegrationTestRequest>(request);

    if (!asString(payload.tenant_id) || !asString(payload.integration_type_id) || !isRecord(payload.credentials)) {
      throw new HttpError(400, 'tenant_id, integration_type_id, and credentials are required.');
    }

    const admin = createAdminClient();
    await authorizeTenantActor(request, admin, payload.tenant_id);

    if (!isZohoIntegrationTypeId(payload.integration_type_id)) {
      throw new HttpError(501, `Only Zoho runtime connection tests are implemented right now. Received ${payload.integration_type_id}.`);
    }

    const adapter = createZohoAdapter(payload.integration_type_id, payload.credentials);
    const meta = await adapter.testConnection();

    return jsonResponse({
      ok: true,
      integration_type_id: payload.integration_type_id,
      meta,
    });
  } catch (error) {
    return handleRequestError(error);
  }
}

export async function handleIntegrationsSync(request: Request): Promise<Response> {
  try {
    requireMethod(request, 'POST');
    const payload = await readJson<IntegrationSyncRequest>(request);
    const tenantIntegrationId = asString(payload.tenant_integration_id);

    if (!tenantIntegrationId) {
      throw new HttpError(400, 'tenant_integration_id is required.');
    }

    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, tenantIntegrationId);
    const actor = await authorizeTenantActor(request, admin, integration.tenant_id);

    if (!isZohoIntegrationTypeId(integration.integration_type_id)) {
      throw new HttpError(501, `Only Zoho runtime sync is implemented right now. Received ${integration.integration_type_id}.`);
    }

    await loadTenantIntegrationSecret(admin, integration.id);

    const jobType = normalizeJobType(payload.job_type);
    const scope = resolveScope(jobType, payload.scope);
    const since = normalizeSince(payload.since);
    const plan = getZohoPhasePlan(integration.integration_type_id, scope);
    const progress = buildInitialProgress(
      scope,
      since,
      plan,
      'Entity persistence is conservative for now: runtime counts and cursors are real, normalized upserts come next.',
    );

    const job = await createSyncJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
      jobType,
      triggeredBy: actor.userId,
      progress,
    });

    await updateTenantIntegration(admin, integration.id, {
      status: 'syncing',
      updated_by: actor.userId,
    });

    const kickoff = dispatchWorkerInvocation(actor.authHeader, {
      job_id: job.id,
      tenant_integration_id: integration.id,
      continuation: false,
      reason: 'initial_dispatch',
      page_limit: payload.page_limit ?? null,
      progress,
    }).catch(async (error) => {
      const refreshedJob = await loadSyncJob(admin, job.id);
      await appendJobError(admin, refreshedJob, error);
      await updateTenantIntegration(admin, integration.id, {
        status: 'sync_failed',
        health_status: classifyHealthStatus(error),
        last_health_check_at: nowIso(),
        updated_by: actor.userId,
      });
      throw error;
    });

    waitUntil(kickoff);

    return jsonResponse({
      ok: true,
      job_id: job.id,
      tenant_integration_id: integration.id,
      status: job.status,
      progress: job.progress,
    }, 202);
  } catch (error) {
    return handleRequestError(error);
  }
}

export async function handleIntegrationsSyncWorker(request: Request): Promise<Response> {
  const fallbackRequest = request.clone();

  try {
    requireMethod(request, 'POST');
    const payload = await readJson<IntegrationWorkerDispatchRequest>(request);

    if (!asString(payload.job_id)) {
      return errorResponse(400, 'job_id is required.');
    }

    const admin = createAdminClient();
    const result = await runWorkerJob(request, payload);
    return jsonResponse({
      ok: true,
      job_id: result.jobId,
      status: result.status,
      continuation_dispatched: result.continuationDispatched,
      progress: result.progress,
      summary: result.summary,
    });
  } catch (error) {
    const admin = createAdminClient();
    const payload = await fallbackRequest.json().catch(() => null) as IntegrationWorkerDispatchRequest | null;
    try {
      if (payload?.job_id) {
        const job = await loadSyncJob(admin, payload.job_id);
        const integration = await loadTenantIntegration(admin, job.tenant_integration_id);
        await appendJobError(admin, job, error);
        await updateTenantIntegration(admin, integration.id, {
          status: 'sync_failed',
          health_status: classifyHealthStatus(error),
          last_health_check_at: nowIso(),
          updated_by: hasValidDispatchSecret(request) ? null : (await requireActor(request, admin)).userId,
        });
      }
    } catch {
      // Keep the original error path intact if cleanup also fails.
    }

    return handleRequestError(error);
  }
}

async function loadWebhook(
  admin: ReturnType<typeof createAdminClient>,
  endpointToken: string,
): Promise<IntegrationWebhookRow> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_webhooks')
    .select('*')
    .eq('endpoint_token', endpointToken)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new HttpError(500, 'Unable to load integration webhook.', { code: error.code ?? undefined });
  if (!data) throw new HttpError(404, 'Integration webhook not found.');
  return data as IntegrationWebhookRow;
}

async function touchWebhookFlows(
  admin: ReturnType<typeof createAdminClient>,
  webhookId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('integration_data_flows')
    .update({
      last_run_at: nowIso(),
    })
    .eq('webhook_id', webhookId)
    .eq('is_active', true);
}

export async function handleIntegrationsWebhook(request: Request): Promise<Response> {
  try {
    requireMethod(request, 'POST');
    const payload = await readJson<IntegrationWebhookRequest>(request);
    const admin = createAdminClient();

    const endpointToken = asString(payload.endpoint_token)
      ?? asString(new URL(request.url).searchParams.get('endpoint_token'))
      ?? asString(request.headers.get('x-integration-endpoint-token'));
    const tenantIntegrationId = asString(payload.tenant_integration_id);

    // When an endpoint_token is present the token itself IS the authentication —
    // it's an opaque secret that only Zoho knows because we registered it.
    // Fall back to standard actor auth only when no endpoint_token is provided.
    let webhook: IntegrationWebhookRow | null = null;
    let integration = null;

    if (endpointToken) {
      webhook = await loadWebhook(admin, endpointToken);
      integration = await loadTenantIntegration(admin, webhook.tenant_integration_id);
    } else if (tenantIntegrationId) {
      integration = await loadTenantIntegration(admin, tenantIntegrationId);
    }

    if (!integration) {
      throw new HttpError(400, 'Provide endpoint_token or tenant_integration_id.');
    }

    // Only require actor auth when the call doesn't carry a valid endpoint_token
    const actor = endpointToken
      ? { userId: 'webhook-endpoint-token', authHeader: null, internal: true } as ActorContext
      : await authorizeTenantActor(request, admin, integration.tenant_id);

    if (webhook) {
      await touchWebhookFlows(admin, webhook.id);
    }

    const scope: IntegrationSyncScope = 'transactional';
    const since = normalizeSince(null);
    const plan = isZohoIntegrationTypeId(integration.integration_type_id)
      ? getZohoPhasePlan(integration.integration_type_id, scope)
      : [];
    const progress = buildInitialProgress(
      scope,
      since,
      plan,
      `Triggered by webhook${payload.event_type ? `: ${payload.event_type}` : ''}.`,
    );

    const job = await createSyncJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
      jobType: 'incremental',
      triggeredBy: actor.internal ? null : actor.userId,
      progress,
    });

    await updateTenantIntegration(admin, integration.id, {
      status: 'syncing',
      updated_by: actor.internal ? null : actor.userId,
    });

    waitUntil(dispatchWorkerInvocation(actor.authHeader, {
      job_id: job.id,
      tenant_integration_id: integration.id,
      continuation: false,
      reason: 'webhook_dispatch',
      progress,
    }).catch(async (error) => {
      const refreshedJob = await loadSyncJob(admin, job.id);
      await appendJobError(admin, refreshedJob, error);
      await updateTenantIntegration(admin, integration.id, {
        status: 'sync_failed',
        health_status: classifyHealthStatus(error),
        last_health_check_at: nowIso(),
        updated_by: actor.internal ? null : actor.userId,
      });
      throw error;
    }));

    return jsonResponse({
      ok: true,
      tenant_integration_id: integration.id,
      job_id: job.id,
      event_type: payload.event_type ?? null,
      webhook_id: webhook?.id ?? null,
    }, 202);
  } catch (error) {
    return handleRequestError(error);
  }
}

function handleRequestError(error: unknown): Response {
  if (error instanceof HttpError) {
    return errorResponse(error.status, error.message, error.details);
  }

  if (error instanceof ZohoApiError) {
    return errorResponse(error.status, error.message, {
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.payload && isRecord(error.payload) ? { payload: scrubSecretValue(error.payload) as JsonRecord } : {}),
    });
  }

  const message = error instanceof Error ? error.message : 'Unexpected integrations runtime error.';
  return errorResponse(500, message);
}
