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
  buildIntegrationDataFlowRows,
  buildIntegrationTopologyConfig,
} from '../../../src/lib/integrations/definitions.ts';
import { normalizeIntegrationJobErrorLog } from '../../../src/lib/integrations/job-error-log.ts';
import {
  getZohoWebhookProviderIdField,
  getZohoWebhookTimestampFields,
  resolveZohoWebhookEventType,
} from '../../../src/lib/integrations/zoho-webhooks.ts';
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
import { persistZohoEntityPage, resolveInternalIdWithFallback, type PersistResult } from './integrations-persist.ts';

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
  provider: string;
  entity_type: string | null;
  remote_webhook_id: string | null;
  secret: string | null;
  status: 'pending' | 'active' | 'failed' | 'disabled';
  webhook_config: JsonRecord;
  last_verified_at: string | null;
  last_received_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  external_ref: string | null;
}

const WEBHOOK_PHASE_BY_ENTITY: Record<string, 'customers' | 'products' | 'estimates' | 'orders' | 'invoices'> = {
  contacts: 'customers',
  items: 'products',
  estimates: 'estimates',
  salesorders: 'orders',
  invoices: 'invoices',
};

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

interface NormalizedWebhookEnvelope {
  entityType: string | null;
  phase: 'customers' | 'products' | 'estimates' | 'orders' | 'invoices' | null;
  incomingEventType: string | null;
  providerEntityId: string | null;
  externalRef: string | null;
  providerTimestamp: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  entityPayload: JsonRecord | null;
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

const DEFAULT_PAGE_LIMIT = 20;
const ZOHO_DEFAULT_PER_PAGE = 1000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asJsonRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}

function normalizeTimestamp(value: unknown): string | null {
  const stringValue = asString(value);
  if (!stringValue) return null;
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

function normalizeRunOrigin(value: unknown): 'manual' | 'scheduled' | 'webhook' | null {
  if (value === 'manual' || value === 'scheduled' || value === 'webhook') return value;
  return null;
}

function normalizeSyncWindow(value: unknown): string | null {
  return asString(value);
}

function resolveScope(jobType: IntegrationJobType, requestedScope: unknown): IntegrationSyncScope {
  if (requestedScope === 'reference' || requestedScope === 'transactional' || requestedScope === 'full') {
    return requestedScope;
  }

  if (jobType === 'initial_reference') return 'reference';
  if (jobType === 'initial_transactional' || jobType === 'incremental') return 'transactional';
  return 'full';
}

function resolveScopeForPhase(phase: string | null | undefined): IntegrationSyncScope {
  if (phase === 'transactions' || phase === 'estimates' || phase === 'orders' || phase === 'invoices') {
    return 'transactional';
  }
  return 'reference';
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeSince(value: unknown): string | null {
  const since = asString(value);
  if (!since) return null;
  const parsed = new Date(since);
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
}

function normalizeMaxPages(value: unknown): number | null {
  const count = asNumber(value);
  return count != null && count > 0 ? Math.floor(count) : null;
}

function getProgressMaxPages(progress: IntegrationJobProgress | null | undefined): number | null {
  if (!progress || !isRecord(progress.meta)) return null;
  return normalizeMaxPages(progress.meta.max_pages);
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

async function readWebhookPayload(
  request: Request,
  traceId: string,
): Promise<{
  payload: IntegrationWebhookRequest;
  rawBody: string;
  parseMode: 'json' | 'form' | 'empty';
  parseError: string | null;
  contentType: string | null;
}> {
  const contentType = request.headers.get('content-type');
  const rawBody = await request.clone().text();
  const trimmed = rawBody.trim();

  if (!trimmed) {
    logWebhookTrace('info', traceId, 'webhook body is empty; continuing with an empty payload', {
      content_type: contentType,
    });
    return {
      payload: {},
      rawBody,
      parseMode: 'empty',
      parseError: null,
      contentType,
    };
  }

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const form = Object.fromEntries(new URLSearchParams(rawBody).entries());
    const nestedPayload = asString(form.payload);
    let parsedPayload: JsonRecord = form;
    if (nestedPayload) {
      try {
        const decoded = JSON.parse(nestedPayload);
        if (isRecord(decoded)) {
          parsedPayload = { ...form, payload: decoded };
        }
      } catch (error) {
        logWebhookTrace('warn', traceId, 'Zoho webhook form payload contained invalid nested JSON', {
          content_type: contentType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      payload: parsedPayload as IntegrationWebhookRequest,
      rawBody,
      parseMode: 'form',
      parseError: null,
      contentType,
    };
  }

  try {
    return {
      payload: JSON.parse(rawBody) as IntegrationWebhookRequest,
      rawBody,
      parseMode: 'json',
      parseError: null,
      contentType,
    };
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    logWebhookTrace('warn', traceId, 'Zoho webhook body was not valid JSON; continuing with an empty payload', {
      content_type: contentType,
      error: parseError,
      body_preview: shortenForLog(rawBody),
    });
    return {
      payload: {},
      rawBody,
      parseMode: 'empty',
      parseError,
      contentType,
    };
  }
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

function hasValidWebhookToken(request: Request, webhook: IntegrationWebhookRow): boolean {
  const received = request.headers.get('x-zoho-webhook-token');
  return Boolean(received && webhook.secret && received === webhook.secret);
}

function hasValidDispatchSecret(request: Request): boolean {
  const expected = getDispatchSecret();
  const received = request.headers.get('x-integrations-dispatch-secret');
  return Boolean(expected && received && expected === received);
}

async function hasValidZohoCronToken(
  request: Request,
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<boolean> {
  const received = request.headers.get('x-zoho-cron-token');
  if (!received) return false;

  const { data, error } = await admin
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return false;

  const settings = coerceRecord((data as { settings?: unknown }).settings);
  return typeof settings.zoho_daily_sync_cron_token === 'string' && settings.zoho_daily_sync_cron_token === received;
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
  if (hasValidDispatchSecret(request) || await hasValidZohoCronToken(request, admin, tenantId)) {
    return {
      userId: 'internal-dispatch',
      authHeader: getBearerHeader(request),
      internal: true,
    };
  }

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

async function softDeleteIntegrationChildren(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  actorUserId: string,
): Promise<void> {
  const now = nowIso();

  await admin
    .schema('app')
    .from('integration_entity_map')
    .update({
      deleted_at: now,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq('tenant_integration_id', tenantIntegrationId)
    .is('deleted_at', null);

  await admin
    .schema('app')
    .from('integration_data_flows')
    .update({
      is_active: false,
      deleted_at: now,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq('tenant_integration_id', tenantIntegrationId)
    .is('deleted_at', null);

  await admin
    .schema('app')
    .from('integration_webhooks')
    .update({
      is_active: false,
      deleted_at: now,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq('tenant_integration_id', tenantIntegrationId)
    .is('deleted_at', null);

  await admin
    .schema('app')
    .from('integration_sync_jobs')
    .update({
      status: 'cancelled',
      progress: {
        phase: 'cancelled',
        phase_label: 'Cancelled during disconnect',
        phases_total: 0,
        phase_current: 0,
        items_total: 0,
        items_processed: 0,
        items_failed: 0,
        cursor: null,
        updated_at: now,
      },
      error_log: null,
      summary: null,
      started_at: null,
      completed_at: now,
      deleted_at: now,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq('tenant_integration_id', tenantIntegrationId)
    .is('deleted_at', null);
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

  if (error) {
    throw new HttpError(500, error.message ?? 'Unable to persist integration secret.', {
      code: error.code ?? undefined,
    });
  }
}

async function loadTenantIntegrationSecret(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  expectedIntegrationTypeId: IntegrationTypeId,
): Promise<JsonRecord> {
  const { data, error } = await admin
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: tenantIntegrationId,
      p_expected_integration_type_id: expectedIntegrationTypeId,
    });

  if (error) {
    throw new HttpError(500, error.message ?? 'Unable to retrieve integration secret.', {
      code: error.code ?? undefined,
    });
  }
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
  const existingEntries = normalizeIntegrationJobErrorLog(job.error_log);
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
    error_log: nextEntries,
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
  meta?: JsonRecord,
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
          per_page: first.perPage ?? ZOHO_DEFAULT_PER_PAGE,
          has_more: true,
          since,
        }
      : null,
    counts: buildProgressCounts(plan),
    started_at: startedAt,
    updated_at: startedAt,
    ...(meta ? { meta } : {}),
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
    meta: isRecord(raw.meta) ? raw.meta : fallback.meta,
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
        per_page: nextPhase.perPage ?? ZOHO_DEFAULT_PER_PAGE,
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
  const meta = isRecord(progress.meta) ? progress.meta : {};
  const runOrigin = normalizeRunOrigin(meta.run_origin);
  const syncWindow = normalizeSyncWindow(meta.sync_window);

  return {
    provider: 'zoho',
    scope: progress.scope,
    since: progress.since,
    ...(runOrigin ? { run_origin: runOrigin } : {}),
    ...(syncWindow ? { sync_window: syncWindow } : {}),
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
  actorOverride?: ActorContext,
): Promise<WorkerExecutionResult> {
  const admin = createAdminClient();
  const job = await loadSyncJob(admin, payload.job_id);
  const integration = await loadTenantIntegration(admin, job.tenant_integration_id);
  const actor = actorOverride ?? await authorizeTenantActor(request, admin, integration.tenant_id);
  const importActorId = actor.internal
    ? (integration.connected_by ?? job.triggered_by ?? null)
    : actor.userId;

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

  const credentials = isRecord(payload.credentials)
    ? payload.credentials
    : await loadTenantIntegrationSecret(admin, integration.id, integration.integration_type_id);
  const adapter = createAdapterForIntegration(integration, credentials);
  const scope = resolveScope(job.job_type, (payload.progress as JsonRecord | null)?.scope);
  const since = normalizeSince((payload.progress as JsonRecord | null)?.since) ?? normalizeSince((job.progress as JsonRecord)?.since);
  const plan = getZohoPhasePlan(adapter.integrationTypeId, scope);
  let progress = hydrateProgress(payload.progress ?? job.progress, scope, since, plan);
  const maxPages = getProgressMaxPages(progress);

  if (job.status === 'cancelled') {
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: nowIso(),
      updated_by: importActorId,
    });

    return {
      jobId: job.id,
      status: 'noop',
      continuationDispatched: false,
      progress,
      summary: (job.summary as unknown as IntegrationJobSummary | null) ?? null,
    };
  }

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
      updated_by: importActorId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: nowIso(),
      updated_by: importActorId,
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
      updated_by: importActorId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'syncing',
      updated_by: importActorId,
    });
  }

  const pageLimit = normalizePageLimit(payload.page_limit);
  let processedPages = 0;

  while (processedPages < pageLimit && progress.phase) {
    const liveJob = await loadSyncJob(admin, job.id);
    if (liveJob.status === 'cancelled') {
      progress = hydrateProgress(liveJob.progress, scope, since, plan);
      await updateTenantIntegration(admin, integration.id, {
        status: 'connected',
        health_status: 'ok',
        last_health_check_at: nowIso(),
        updated_by: importActorId,
      });
      return {
        jobId: job.id,
        status: 'noop',
        continuationDispatched: false,
        progress,
        summary: (liveJob.summary as unknown as IntegrationJobSummary | null) ?? null,
      };
    }

    if (maxPages != null && progress.pages_processed >= maxPages) {
      break;
    }

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
          per_page: currentPhase.perPage ?? ZOHO_DEFAULT_PER_PAGE,
          has_more: true,
          since: progress.since,
        };

    const page = await adapter.fetchPhasePage(currentPhase, cursor, progress.since);

    if (page.records.length > 0) {
      try {
        const persistResult = await persistZohoEntityPage(
          admin,
          integration.tenant_id,
          importActorId,
          integration.id,
          currentPhase.entityType,
          integration.integration_type_id as ZohoIntegrationTypeId,
          page.records,
          adapter,
        );
        const webhookEventId = isRecord(progress.meta) ? asString(progress.meta.webhook_event_id) : null;
        if (webhookEventId) {
          const targetTables: Record<string, string> = {
            locations: 'locations', customers: 'buyers', products: 'tenant_products', estimates: 'estimates', orders: 'orders', invoices: 'invoices',
          };
          await admin.schema('app').from('integration_webhook_event_changes').insert({
            tenant_id: integration.tenant_id,
            tenant_integration_id: integration.id,
            integration_webhook_event_id: webhookEventId,
            entity_type: currentPhase.entityType,
            target_table: `app.${targetTables[currentPhase.entityType] ?? currentPhase.entityType}`,
            target_entity_type: currentPhase.entityType,
            operation: persistResult.created > 0 ? 'create' : persistResult.updated > 0 ? 'update' : 'skip',
            merge_decision: 'targeted_remote_fetch',
            after_state: { processed: persistResult.created + persistResult.updated },
            delta: persistResult,
          });
        }
      } catch (persistError) {
        const webhookEventId = isRecord(progress.meta) ? asString(progress.meta.webhook_event_id) : null;
        if (webhookEventId) {
          const webhookId = asString(isRecord(progress.meta) ? progress.meta.webhook_id : null);
          const { data: webhookRow } = webhookId
            ? await admin.schema('app').from('integration_webhooks').select('*').eq('id', webhookId).maybeSingle()
            : { data: null };
          if (webhookRow) {
            await appendWebhookError(admin, {
              webhook: webhookRow as IntegrationWebhookRow,
              eventId: webhookEventId,
              stage: 'persist',
              error: persistError,
            });
          }
        }
        progress = {
          ...progress,
          note: persistError instanceof Error
            ? `Persist error (${currentPhase.entityType}): ${persistError.message}`
            : `Persist error (${currentPhase.entityType}): unknown`,
          updated_at: nowIso(),
        };
      }
    }

    progress = applyPhasePage(progress, plan, {
      phase: currentPhase,
      records: page.records,
      nextCursor: page.nextCursor,
    });

    await updateSyncJob(admin, job.id, {
      progress: asJsonRecord(progress),
      status: 'running',
      updated_by: importActorId,
    });

    processedPages += 1;
  }

  const testPageLimitReached = maxPages != null && progress.pages_processed >= maxPages;

  if (testPageLimitReached) {
    const completedAt = nowIso();
    progress = {
      ...progress,
      note: progress.note ?? `Stopped after the test page limit of ${maxPages} pages.`,
      updated_at: completedAt,
    };
    const summary = buildSummary(progress);
    await updateSyncJob(admin, job.id, {
      status: 'completed',
      progress: asJsonRecord(progress),
      summary: asJsonRecord(summary),
      completed_at: completedAt,
      updated_by: importActorId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: completedAt,
      updated_by: importActorId,
    });

    return {
      jobId: job.id,
      status: 'completed',
      continuationDispatched: false,
      progress,
      summary,
    };
  }

  if (!progress.phase) {
    const summary = buildSummary(progress);
    await updateSyncJob(admin, job.id, {
      status: 'completed',
      progress: asJsonRecord(progress),
      summary: asJsonRecord(summary),
      completed_at: nowIso(),
      updated_by: importActorId,
    });
    await updateTenantIntegration(admin, integration.id, {
      status: 'connected',
      health_status: 'ok',
      last_health_check_at: nowIso(),
      updated_by: importActorId,
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
        updated_by: importActorId,
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
      updated_by: importActorId,
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
    const config = {
      ...describeConnectionMeta(meta as unknown as JsonRecord, isRecord(payload.config) ? payload.config : {}),
      ...buildIntegrationTopologyConfig(integrationTypeId),
    };
    const updated = await updateTenantIntegration(admin, tenantIntegration.id, {
      status: 'connected',
      config,
      health_status: 'ok',
      last_health_check_at: nowIso(),
      connected_at: nowIso(),
      connected_by: actor.userId,
      updated_by: actor.userId,
    });

    const seededFlows = buildIntegrationDataFlowRows({
      tenant_id: payload.tenant_id,
      tenant_integration_id: tenantIntegration.id,
      integration_type_id: integrationTypeId,
      created_by: actor.userId,
      updated_by: actor.userId,
    }).filter((row) => row.trigger_type !== 'webhook' || row.webhook_id !== null);

    if (seededFlows.length > 0) {
      await admin
        .schema('app')
        .from('integration_data_flows')
        .upsert(seededFlows, { onConflict: 'tenant_id,tenant_integration_id,entity_type' });
    }

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

export async function handleIntegrationsDisconnect(request: Request): Promise<Response> {
  try {
    requireMethod(request, 'POST');
    const payload = await readJson<{ tenant_integration_id?: string | null }>(request);
    const tenantIntegrationId = asString(payload.tenant_integration_id);

    if (!tenantIntegrationId) {
      throw new HttpError(400, 'tenant_integration_id is required.');
    }

    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, tenantIntegrationId);
    const actor = await authorizeTenantActor(request, admin, integration.tenant_id);

    await softDeleteIntegrationChildren(admin, integration.id, actor.userId);

    if (integration.vault_secret_id) {
      try {
        await admin
          .schema('app')
          .rpc('delete_tenant_integration_secret', {
            p_tenant_integration_id: integration.id,
            p_actor_user_id: actor.userId,
          });
      } catch (error) {
        throw new HttpError(500, 'Unable to remove integration secret.', {
          code: error instanceof Error ? error.message : 'SECRET_DELETE_FAILED',
        });
      }
    }

    await updateTenantIntegration(admin, integration.id, {
      status: 'disconnected',
      health_status: null,
      connected_at: null,
      connected_by: null,
      last_health_check_at: null,
      config: {
        ...scrubSecretValue(integration.config),
      } as JsonRecord,
      deleted_at: nowIso(),
      updated_by: actor.userId,
    });

    return jsonResponse({
      ok: true,
      tenant_integration_id: integration.id,
      status: 'disconnected',
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

    const credentials = await loadTenantIntegrationSecret(admin, integration.id, integration.integration_type_id);

    const jobType = normalizeJobType(payload.job_type);
    const runOrigin = normalizeRunOrigin((payload as JsonRecord).run_origin) ?? 'manual';
    const syncWindow = normalizeSyncWindow((payload as JsonRecord).sync_window)
      ?? (runOrigin === 'scheduled' ? 'Last 24 hours' : null);
    const requestedPhase = asString((payload as JsonRecord).phase);
    const scope = requestedPhase ? resolveScopeForPhase(requestedPhase) : resolveScope(jobType, payload.scope);
    const since = normalizeSince(payload.since);
    const scopedPlan = getZohoPhasePlan(integration.integration_type_id, scope);
    const plan = requestedPhase === 'transactions'
      ? scopedPlan
      : requestedPhase
        ? scopedPlan.filter((phase) => phase.id === requestedPhase)
        : scopedPlan;

    if (requestedPhase && requestedPhase !== 'transactions' && plan.length === 0) {
      throw new HttpError(400, `Unknown sync phase ${requestedPhase}.`);
    }

    const progress = buildInitialProgress(
      scope,
      since,
      plan,
      requestedPhase === 'transactions'
        ? 'Running transaction sync across estimates, sales orders, and invoices.'
        : requestedPhase
          ? `Running phase sync for ${requestedPhase}.`
          : 'Entity persistence is conservative for now: runtime counts and cursors are real, normalized upserts come next.',
      {
        ...(typeof payload.max_pages === 'number' && payload.max_pages > 0 ? { max_pages: payload.max_pages } : {}),
        run_origin: runOrigin,
        ...(syncWindow ? { sync_window: syncWindow } : {}),
      },
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
      credentials,
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

function requestHeadersForAudit(request: Request): JsonRecord {
  return Object.fromEntries(
    [...request.headers.entries()].map(([key, value]) => [
      key,
      /token|secret|authorization/i.test(key) ? '***' : value,
    ]),
  );
}

function makeRequestTraceId(request: Request): string {
  return asString(request.headers.get('x-request-id'))
    ?? asString(request.headers.get('x-vercel-id'))
    ?? crypto.randomUUID();
}

function shortenForLog(value: string, maxLength = 1200): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function logWebhookTrace(
  level: 'info' | 'warn' | 'error',
  traceId: string,
  message: string,
  details: JsonRecord = {},
): void {
  const safeDetails = scrubSecretValue(details);
  const payload = Object.keys(safeDetails).length > 0 ? safeDetails : undefined;
  const prefix = `[integrations-webhook:${traceId}] ${message}`;
  if (level === 'warn') {
    console.warn(prefix, payload);
    return;
  }
  if (level === 'error') {
    console.error(prefix, payload);
    return;
  }
  console.info(prefix, payload);
}

function extractEndpointTokenFromPath(request: Request): string | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.lastIndexOf('integrations-webhook');
  if (index < 0 || index + 1 >= parts.length) return null;
  return asString(decodeURIComponent(parts[index + 1]));
}

function resolveWebhookExternalEntityId(payload: IntegrationWebhookRequest): string | null {
  const body = isRecord(payload.payload) ? payload.payload : payload;
  return asString(body.entity_id)
    ?? asString(body.id)
    ?? asString(body.contact_id)
    ?? asString(body.item_id)
    ?? asString(body.estimate_id)
    ?? asString(body.invoice_id)
    ?? asString(body.salesorder_id);
}

function parseJsonRecordString(value: unknown): JsonRecord | null {
  const stringValue = asString(value);
  if (!stringValue) return null;
  try {
    const parsed = JSON.parse(stringValue);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractZohoEntityPayload(body: JsonRecord, entityType: string | null): JsonRecord | null {
  const candidates: unknown[] = [
    body.payload,
    body.entity,
    entityType ? body[entityType] : null,
    entityType ? body[entityType.replace(/s$/, '')] : null,
  ];

  for (const candidate of candidates) {
    if (isRecord(candidate)) return candidate;
    const parsed = parseJsonRecordString(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function resolveWebhookEntityIdentity(
  entityType: string | null,
  body: JsonRecord,
  entityPayload: JsonRecord | null,
): {
  providerEntityId: string | null;
  externalRef: string | null;
  providerTimestamp: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
} {
  const providerIdField = entityType ? getZohoWebhookProviderIdField(entityType) : null;
  const timestampFields = entityType ? getZohoWebhookTimestampFields(entityType) : ['last_modified_time', 'updated_time', 'created_time'];
  const payload = entityPayload ?? {};

  const providerEntityId = asString(body.provider_entity_id)
    ?? asString(body.entity_id)
    ?? (providerIdField ? asString(body[providerIdField]) : null)
    ?? asString(payload.provider_entity_id)
    ?? asString(payload.entity_id)
    ?? (providerIdField ? asString(payload[providerIdField]) : null)
    ?? resolveWebhookExternalEntityId({ payload });

  const externalRef = asString(body.external_ref)
    ?? asString(payload.external_ref)
    ?? providerEntityId;

  const providerTimestamp = normalizeTimestamp(body.provider_timestamp)
    ?? timestampFields.map((field) => normalizeTimestamp(body[field])).find((value) => value !== null)
    ?? timestampFields.map((field) => normalizeTimestamp(payload[field])).find((value) => value !== null)
    ?? null;

  const sourceCreatedAt = normalizeTimestamp(body.created_time)
    ?? normalizeTimestamp(payload.created_time)
    ?? normalizeTimestamp(payload.date)
    ?? null;
  const sourceUpdatedAt = providerTimestamp
    ?? normalizeTimestamp(body.updated_time)
    ?? normalizeTimestamp(payload.updated_time)
    ?? null;

  return {
    providerEntityId,
    externalRef,
    providerTimestamp,
    sourceCreatedAt,
    sourceUpdatedAt,
  };
}

function normalizeWebhookEnvelope(
  webhook: IntegrationWebhookRow | null,
  payload: IntegrationWebhookRequest,
  requestUrl: URL,
): NormalizedWebhookEnvelope {
  const body = isRecord(payload) ? payload : {};
  const entityType = asString(body.entity_type)
    ?? asString(requestUrl.searchParams.get('entity_type'))
    ?? webhook?.entity_type
    ?? null;
  const entityPayload = extractZohoEntityPayload(body, entityType);
  const identity = resolveWebhookEntityIdentity(entityType, body, entityPayload);

  return {
    entityType,
    phase: entityType ? (WEBHOOK_PHASE_BY_ENTITY[entityType] ?? null) : null,
    incomingEventType: asString(body.event_type)
      ?? asString(requestUrl.searchParams.get('event_type')),
    providerEntityId: identity.providerEntityId,
    externalRef: identity.externalRef,
    providerTimestamp: identity.providerTimestamp,
    sourceCreatedAt: identity.sourceCreatedAt,
    sourceUpdatedAt: identity.sourceUpdatedAt,
    entityPayload,
  };
}

function buildWebhookNormalizedPayload(envelope: NormalizedWebhookEnvelope, resolvedInternalId: string | null, eventType: string | null): JsonRecord {
  return {
    entity_type: envelope.entityType,
    event_type: eventType,
    provider_entity_id: envelope.providerEntityId,
    external_ref: envelope.externalRef,
    resolved_internal_id: resolvedInternalId,
    provider_timestamp: envelope.providerTimestamp,
    payload_present: Boolean(envelope.entityPayload),
    received_at: nowIso(),
  };
}

async function createWebhookAuditEvent(
  admin: ReturnType<typeof createAdminClient>,
  webhook: IntegrationWebhookRow,
  payload: IntegrationWebhookRequest,
  request: Request,
  traceId: string,
  runtimeMeta: JsonRecord = {},
): Promise<string> {
  const eventType = asString(payload.event_type);
  const externalEntityId = resolveWebhookExternalEntityId(payload);
  const { data, error } = await admin.schema('app').from('integration_webhook_events').insert({
    tenant_id: webhook.tenant_id,
    tenant_integration_id: webhook.tenant_integration_id,
    integration_webhook_id: webhook.id,
    provider: webhook.provider,
    entity_type: webhook.entity_type ?? 'unknown',
    event_type: eventType,
    external_entity_id: externalEntityId,
    remote_webhook_id: webhook.remote_webhook_id,
    request_headers: requestHeadersForAudit(request),
    request_query: scrubSecretValue(Object.fromEntries(new URL(request.url).searchParams.entries())) as JsonRecord,
    raw_payload: scrubSecretValue(payload) as JsonRecord,
    normalized_payload: {
      entity_type: webhook.entity_type,
      event_type: eventType,
      external_ref: externalEntityId,
      received_at: nowIso(),
    },
    processing_status: 'processing',
    runtime_meta: {
      trace_id: traceId,
      ...runtimeMeta,
    },
  }).select('id').single();
  if (error || !data) throw new HttpError(500, 'Unable to write webhook audit event.', { code: error?.code });
  return data.id as string;
}

async function appendWebhookError(
  admin: ReturnType<typeof createAdminClient>,
  input: { webhook: IntegrationWebhookRow; eventId?: string | null; eventType?: string | null; stage: string; error: unknown },
): Promise<void> {
  const message = input.error instanceof Error ? input.error.message : 'Unexpected webhook processing error.';
  await admin.schema('app').from('integration_webhook_errors').insert({
    tenant_id: input.webhook.tenant_id,
    tenant_integration_id: input.webhook.tenant_integration_id,
    integration_webhook_id: input.webhook.id,
    integration_webhook_event_id: input.eventId ?? null,
    provider: input.webhook.provider,
    entity_type: input.webhook.entity_type,
    event_type: input.eventType ?? null,
    stage: input.stage,
    reason_code: input.error instanceof HttpError ? `HTTP_${input.error.status}` : 'UNEXPECTED',
    message,
    retryable: !(input.error instanceof HttpError && input.error.status < 500),
    debug_payload: input.error instanceof HttpError ? (input.error.details ?? {}) : {},
  });
}

function getWebhookTargetTable(phase: 'customers' | 'products' | 'estimates' | 'orders' | 'invoices'): string {
  return phase === 'customers'
    ? 'buyers'
    : phase === 'products'
      ? 'tenant_products'
      : phase;
}

async function resolveWebhookTargetInternalId(
  admin: ReturnType<typeof createAdminClient>,
  webhook: IntegrationWebhookRow,
  envelope: NormalizedWebhookEnvelope,
): Promise<{
  internalId: string | null;
  by: 'external_ref' | 'provider_entity_id' | null;
  conflict: boolean;
  details?: JsonRecord;
}> {
  if (!envelope.phase) {
    return { internalId: null, by: null, conflict: false };
  }

  const tableName = getWebhookTargetTable(envelope.phase);
  const externalRefId = envelope.externalRef
    ? await resolveInternalIdWithFallback(
      admin,
      webhook.tenant_id,
      webhook.tenant_integration_id,
      envelope.phase,
      tableName,
      envelope.externalRef,
    )
    : null;
  const providerId = envelope.providerEntityId && envelope.providerEntityId !== envelope.externalRef
    ? await resolveInternalIdWithFallback(
      admin,
      webhook.tenant_id,
      webhook.tenant_integration_id,
      envelope.phase,
      tableName,
      envelope.providerEntityId,
    )
    : externalRefId;

  if (externalRefId && providerId && externalRefId !== providerId) {
    return {
      internalId: null,
      by: null,
      conflict: true,
      details: {
        external_ref: envelope.externalRef,
        external_ref_internal_id: externalRefId,
        provider_entity_id: envelope.providerEntityId,
        provider_entity_internal_id: providerId,
      },
    };
  }

  if (externalRefId) {
    return { internalId: externalRefId, by: 'external_ref', conflict: false };
  }
  if (providerId) {
    return { internalId: providerId, by: 'provider_entity_id', conflict: false };
  }

  return { internalId: null, by: null, conflict: false };
}

async function softDeleteWebhookEntity(
  admin: ReturnType<typeof createAdminClient>,
  webhook: IntegrationWebhookRow,
  eventId: string,
  envelope: NormalizedWebhookEnvelope,
): Promise<string | null> {
  if (!envelope.phase) return null;
  const targetTable = getWebhookTargetTable(envelope.phase);
  const resolved = await resolveWebhookTargetInternalId(admin, webhook, envelope);
  if (!resolved.internalId) return null;

  const deletedAt = nowIso();
  await admin.schema('app').from(targetTable).update({ deleted_at: deletedAt, updated_by: webhook.created_by }).eq('id', resolved.internalId);
  await admin.schema('app').from('integration_webhook_event_changes').insert({
    tenant_id: webhook.tenant_id,
    tenant_integration_id: webhook.tenant_integration_id,
    integration_webhook_event_id: eventId,
    entity_type: webhook.entity_type ?? 'unknown',
    target_table: `app.${targetTable}`,
    target_entity_type: envelope.phase,
    target_row_id: resolved.internalId,
    operation: 'soft_delete',
    merge_decision: 'remote_delete',
    before_state: { deleted_at: null },
    after_state: { deleted_at: deletedAt },
    delta: {
      deleted_at: deletedAt,
      provider_entity_id: envelope.providerEntityId,
      external_ref: envelope.externalRef,
    },
  });
  return resolved.internalId;
}

async function applyDirectWebhookEntity(
  admin: ReturnType<typeof createAdminClient>,
  integration: TenantIntegrationRow,
  webhook: IntegrationWebhookRow,
  eventId: string,
  envelope: NormalizedWebhookEnvelope,
  actorUserId: string | null,
): Promise<{
  operation: 'create' | 'update';
  resolvedInternalId: string;
  mergeDecision: string;
  persistResult: PersistResult;
  eventType: string | null;
}> {
  if (!envelope.phase || !envelope.entityPayload) {
    throw new HttpError(400, 'Webhook payload did not contain a direct Zoho entity payload.');
  }

  const before = await resolveWebhookTargetInternalId(admin, webhook, envelope);
  if (before.conflict) {
    await admin.schema('app').from('integration_webhook_event_changes').insert({
      tenant_id: webhook.tenant_id,
      tenant_integration_id: webhook.tenant_integration_id,
      integration_webhook_event_id: eventId,
      entity_type: webhook.entity_type ?? 'unknown',
      target_table: `app.${getWebhookTargetTable(envelope.phase)}`,
      target_entity_type: envelope.phase,
      operation: 'conflict',
      merge_decision: 'identifier_conflict',
      delta: before.details ?? {},
      external_ref: envelope.externalRef,
    });
    throw new HttpError(409, 'Webhook identifiers resolved to conflicting internal records.', before.details);
  }

  const persistResult = await persistZohoEntityPage(
    admin,
    integration.tenant_id,
    actorUserId,
    integration.id,
    envelope.phase,
    integration.integration_type_id as ZohoIntegrationTypeId,
    [envelope.entityPayload],
  );

  const after = await resolveWebhookTargetInternalId(admin, webhook, envelope);
  if (!after.internalId) {
    throw new HttpError(422, 'Webhook entity was persisted but no internal row could be resolved afterwards.', {
      entity_type: envelope.entityType,
      provider_entity_id: envelope.providerEntityId,
      external_ref: envelope.externalRef,
    });
  }

  const operation: 'create' | 'update' = before.internalId ? 'update' : 'create';
  const eventType = resolveZohoWebhookEventType(envelope.entityType ?? webhook.entity_type ?? envelope.phase, envelope.incomingEventType, operation);

  await admin.schema('app').from('integration_webhook_event_changes').insert({
    tenant_id: webhook.tenant_id,
    tenant_integration_id: webhook.tenant_integration_id,
    integration_webhook_event_id: eventId,
    entity_type: webhook.entity_type ?? 'unknown',
    target_table: `app.${getWebhookTargetTable(envelope.phase)}`,
    target_entity_type: envelope.phase,
    target_row_id: after.internalId,
    operation,
    merge_decision: before.by ? `matched_by_${before.by}` : 'created_from_direct_payload',
    delta: {
      provider_entity_id: envelope.providerEntityId,
      external_ref: envelope.externalRef,
      persist_result: persistResult,
    },
    external_ref: envelope.externalRef,
  });

  return {
    operation,
    resolvedInternalId: after.internalId,
    mergeDecision: before.by ? `matched_by_${before.by}` : 'created_from_direct_payload',
    persistResult,
    eventType,
  };
}

export async function handleIntegrationsWebhook(request: Request): Promise<Response> {
  let webhookForAudit: IntegrationWebhookRow | null = null;
  let auditEventId: string | null = null;
  let payloadForAudit: IntegrationWebhookRequest | null = null;
  let webhookParseMode: 'json' | 'form' | 'empty' | null = null;
  let webhookParseError: string | null = null;
  const traceId = makeRequestTraceId(request);
  const requestUrl = new URL(request.url);
  try {
    requireMethod(request, 'POST');
    const endpointTokenFromUrl = asString(requestUrl.searchParams.get('endpoint_token'));
    const endpointTokenFromHeader = asString(request.headers.get('x-integration-endpoint-token'));
    const endpointTokenFromPath = extractEndpointTokenFromPath(request);
    const tenantIntegrationIdFromUrl = asString(requestUrl.searchParams.get('tenant_integration_id'));
    logWebhookTrace('info', traceId, 'webhook ingress received', {
      method: request.method,
      pathname: requestUrl.pathname,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      content_type: request.headers.get('content-type'),
      raw_body_length: request.headers.get('content-length'),
      endpoint_token_source: endpointTokenFromUrl
        ? 'query'
        : endpointTokenFromHeader
          ? 'header'
          : endpointTokenFromPath
            ? 'path'
            : null,
      endpoint_token_present: Boolean(endpointTokenFromUrl || endpointTokenFromHeader || endpointTokenFromPath),
      tenant_integration_id_present: Boolean(tenantIntegrationIdFromUrl),
    });
    const parsedPayload = await readWebhookPayload(request, traceId);
    const payload = parsedPayload.payload;
    payloadForAudit = payload;
    webhookParseMode = parsedPayload.parseMode;
    webhookParseError = parsedPayload.parseError;
    const admin = createAdminClient();

    const endpointToken = asString(payload.endpoint_token)
      ?? endpointTokenFromUrl
      ?? endpointTokenFromHeader
      ?? endpointTokenFromPath;
    const tenantIntegrationId = asString(payload.tenant_integration_id) ?? tenantIntegrationIdFromUrl;

    // When an endpoint_token is present the token itself IS the authentication —
    // it's an opaque secret that only Zoho knows because we registered it.
    // Fall back to standard actor auth only when no endpoint_token is provided.
    let webhook: IntegrationWebhookRow | null = null;
    let integration = null;

    if (endpointToken) {
      webhook = await loadWebhook(admin, endpointToken);
      webhookForAudit = webhook;
      logWebhookTrace('info', traceId, 'resolved webhook registration from endpoint token', {
        webhook_id: webhook.id,
        tenant_integration_id: webhook.tenant_integration_id,
        entity_type: webhook.entity_type,
        status: webhook.status,
        is_active: webhook.is_active,
        remote_webhook_id: webhook.remote_webhook_id,
        parse_mode: parsedPayload.parseMode,
        parse_error: parsedPayload.parseError,
      });
      if (!webhook.is_active || webhook.status !== 'active' || !webhook.entity_type) {
        throw new HttpError(403, 'Integration webhook is not active.');
      }
      if (!hasValidWebhookToken(request, webhook)) {
        throw new HttpError(401, 'Invalid Zoho webhook token.');
      }
      integration = await loadTenantIntegration(admin, webhook.tenant_integration_id);
    } else if (tenantIntegrationId) {
      logWebhookTrace('info', traceId, 'falling back to tenant integration lookup', {
        tenant_integration_id: tenantIntegrationId,
        parse_mode: parsedPayload.parseMode,
        parse_error: parsedPayload.parseError,
      });
      integration = await loadTenantIntegration(admin, tenantIntegrationId);
    }

    if (!integration) {
      logWebhookTrace('warn', traceId, 'unable to resolve webhook target', {
        body_endpoint_token_present: Boolean(asString(payload.endpoint_token)),
        body_tenant_integration_id_present: Boolean(asString(payload.tenant_integration_id)),
        request_endpoint_token_present: Boolean(endpointToken),
        request_tenant_integration_id_present: Boolean(tenantIntegrationId),
        parse_mode: parsedPayload.parseMode,
        parse_error: parsedPayload.parseError,
        body_preview: shortenForLog(parsedPayload.rawBody),
      });
      throw new HttpError(400, 'Provide endpoint_token or tenant_integration_id.');
    }

    // Only require actor auth when the call doesn't carry a valid endpoint_token
    const actor = endpointToken
      ? { userId: 'webhook-endpoint-token', authHeader: null, internal: true } as ActorContext
      : await authorizeTenantActor(request, admin, integration.tenant_id);
    const importActorId = actor.internal
      ? (integration.connected_by ?? null)
      : actor.userId;
    const envelope = normalizeWebhookEnvelope(webhook, payload, requestUrl);

    if (webhook) {
      await touchWebhookFlows(admin, webhook.id);
      auditEventId = await createWebhookAuditEvent(admin, webhook, payload, request, traceId, {
        parse_mode: parsedPayload.parseMode,
        parse_error: parsedPayload.parseError,
        content_type: parsedPayload.contentType,
      });
      logWebhookTrace('info', traceId, 'webhook audit event created', {
        audit_event_id: auditEventId,
        webhook_id: webhook.id,
        entity_type: webhook.entity_type,
        event_type: payload.event_type ?? null,
      });
      await admin.schema('app').from('integration_webhook_events').update({
        entity_type: envelope.entityType ?? webhook.entity_type ?? 'unknown',
        event_type: envelope.incomingEventType,
        external_entity_id: envelope.providerEntityId,
        external_ref: envelope.externalRef,
        source_created_at: envelope.sourceCreatedAt,
        source_updated_at: envelope.sourceUpdatedAt,
        normalized_payload: buildWebhookNormalizedPayload(envelope, null, envelope.incomingEventType),
      }).eq('id', auditEventId);
    }

    const phase = envelope.phase;
    if (!phase) {
      logWebhookTrace('warn', traceId, 'webhook entity type is not supported', {
        webhook_id: webhook?.id ?? null,
        entity_type: envelope.entityType ?? webhook?.entity_type ?? null,
      });
      throw new HttpError(400, 'Webhook entity type is not supported.');
    }
    const incomingEventType = envelope.incomingEventType;
    if (auditEventId && webhook && incomingEventType?.endsWith('.deleted')) {
      logWebhookTrace('info', traceId, 'processing webhook delete event as soft delete', {
        audit_event_id: auditEventId,
        webhook_id: webhook.id,
        external_entity_id: envelope.providerEntityId,
      });
      const resolvedInternalId = await softDeleteWebhookEntity(admin, webhook, auditEventId, envelope);
      const resolvedEventType = resolveZohoWebhookEventType(envelope.entityType ?? webhook.entity_type ?? phase, incomingEventType, 'soft_delete');
      await admin.schema('app').from('integration_webhook_events').update({
        processing_status: 'processed',
        processed_at: nowIso(),
        event_type: resolvedEventType,
        normalized_payload: buildWebhookNormalizedPayload(envelope, resolvedInternalId, resolvedEventType),
        runtime_meta: { handled_as: 'soft_delete', trace_id: traceId, resolved_internal_id: resolvedInternalId },
      }).eq('id', auditEventId);
      logWebhookTrace('info', traceId, 'soft delete webhook event completed', {
        audit_event_id: auditEventId,
        webhook_id: webhook.id,
        resolved_internal_id: resolvedInternalId,
      });
      return jsonResponse({ ok: true, tenant_integration_id: integration.id, event_type: resolvedEventType, webhook_id: webhook.id }, 200);
    }

    if (!auditEventId || !webhook) {
      throw new HttpError(500, 'Webhook audit state could not be established.');
    }

    try {
      if (!envelope.entityPayload) {
        throw new HttpError(422, 'Webhook payload did not contain a direct Zoho entity payload.', {
          entity_type: envelope.entityType,
          event_type: incomingEventType,
          provider_entity_id: envelope.providerEntityId,
          external_ref: envelope.externalRef,
        });
      }

      const directResult = await applyDirectWebhookEntity(
        admin,
        integration,
        webhook,
        auditEventId,
        envelope,
        importActorId,
      );
      await admin.schema('app').from('integration_webhook_events').update({
        processing_status: 'processed',
        processed_at: nowIso(),
        event_type: directResult.eventType,
        external_entity_id: envelope.providerEntityId,
        external_ref: envelope.externalRef,
        normalized_payload: buildWebhookNormalizedPayload(envelope, directResult.resolvedInternalId, directResult.eventType),
        runtime_meta: {
          handled_as: 'direct_apply',
          trace_id: traceId,
          resolved_internal_id: directResult.resolvedInternalId,
          merge_decision: directResult.mergeDecision,
          persist_result: directResult.persistResult,
        },
      }).eq('id', auditEventId);
      await admin.schema('app').from('integration_webhooks').update({ last_received_at: nowIso() }).eq('id', webhook.id);
      logWebhookTrace('info', traceId, 'direct webhook apply completed', {
        audit_event_id: auditEventId,
        webhook_id: webhook.id,
        resolved_internal_id: directResult.resolvedInternalId,
        event_type: directResult.eventType,
        operation: directResult.operation,
      });
      return jsonResponse({
        ok: true,
        tenant_integration_id: integration.id,
        event_type: directResult.eventType,
        webhook_id: webhook.id,
        resolved_internal_id: directResult.resolvedInternalId,
        processing_mode: 'direct_apply',
      }, 200);
    } catch (error) {
      await appendWebhookError(admin, {
        webhook,
        eventId: auditEventId,
        eventType: incomingEventType,
        stage: 'persist',
        error,
      });
      await admin.schema('app').from('integration_webhook_events').update({
        processing_status: 'failed',
        processed_at: nowIso(),
        normalized_payload: buildWebhookNormalizedPayload(envelope, null, incomingEventType),
        runtime_meta: {
          handled_as: 'direct_apply_failed',
          trace_id: traceId,
          provider_entity_id: envelope.providerEntityId,
          external_ref: envelope.externalRef,
        },
      }).eq('id', auditEventId);
      logWebhookTrace('error', traceId, 'direct webhook apply failed', {
        webhook_id: webhook.id,
        entity_type: envelope.entityType,
        event_type: incomingEventType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    logWebhookTrace('error', traceId, 'webhook handler failed', {
      error: error instanceof Error ? error.message : String(error),
      status: error instanceof HttpError ? error.status : null,
      webhook_id: webhookForAudit?.id ?? null,
      audit_event_id: auditEventId,
      parse_mode: webhookParseMode,
      parse_error: webhookParseError,
      body_preview: payloadForAudit ? shortenForLog(JSON.stringify(scrubSecretValue(payloadForAudit))) : null,
    });
    if (webhookForAudit) {
      const admin = createAdminClient();
      await appendWebhookError(admin, {
        webhook: webhookForAudit,
        eventId: auditEventId,
        eventType: payloadForAudit ? asString(payloadForAudit.event_type) : null,
        stage: auditEventId ? 'dispatch' : 'verify',
        error,
      }).catch(() => undefined);
      if (auditEventId) {
        await admin.schema('app').from('integration_webhook_events').update({
          processing_status: 'failed', processed_at: nowIso(),
        }).eq('id', auditEventId).catch(() => undefined);
      }
    }
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
