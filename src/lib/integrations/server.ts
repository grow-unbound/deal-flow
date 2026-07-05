import { getFlag, FLAGS } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeIntegrationJobErrorLog } from '@/lib/integrations/job-error-log';
import {
  IntegrationAuthSchemaSchema,
  IntegrationCapabilitiesSchema,
  IntegrationConnectRequestSchema,
  IntegrationJobRecordSchema,
  IntegrationJobSummarySchema,
  IntegrationProgressSchema,
  IntegrationSettingsPayloadSchema,
  IntegrationStatusSchema,
  IntegrationSyncRequestSchema,
  IntegrationTestRequestSchema,
  type IntegrationCatalogItem,
  type IntegrationEntityType,
  type IntegrationJobSummary,
  type IntegrationProgress,
  type IntegrationTypeId,
} from '@/types/integrations';

type DbClient = NonNullable<typeof supabaseAdmin>;

type ZohoCredentials = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  org_id: string;
};

type ZohoTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
};

type ZohoListResult<T> = {
  rows: T[];
  hasMore: boolean;
  page: number;
};

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const ZOHO_BOOKS_API_BASE = 'https://www.zohoapis.in/books/v3';
const ZOHO_DEFAULT_PER_PAGE = 1000;

const TYPE_TO_FAMILY_FLAG: Record<IntegrationTypeId, keyof typeof FLAGS> = {
  zoho_books: 'ZOHO_INTEGRATION',
  zoho_inventory: 'ZOHO_INTEGRATION',
  tally_prime: 'TALLY_INTEGRATION',
  busy: 'BUSY_INTEGRATION',
};

const TYPE_TO_ENTITIES: Record<IntegrationTypeId, IntegrationEntityType[]> = {
  zoho_books: ['locations', 'products', 'pricelists', 'customers', 'estimates', 'orders', 'invoices'],
  zoho_inventory: ['locations', 'products', 'pricelists', 'customers', 'estimates', 'orders', 'invoices'],
  tally_prime: ['products', 'customers', 'orders'],
  busy: ['products', 'customers', 'orders'],
};

const ENTITY_ENDPOINTS: Partial<Record<IntegrationEntityType, string>> = {
  products: '/items',
  customers: '/contacts',
  orders: '/salesorders',
  invoices: '/invoices',
  estimates: '/estimates',
};

const COVERAGE_TABLES = [
  { key: 'locations', table: 'locations' },
  { key: 'customers', table: 'buyers' },
  { key: 'products', table: 'tenant_products' },
  { key: 'brands', table: 'tenant_brands' },
  { key: 'categories', table: 'tenant_categories' },
  { key: 'pricelists', table: 'price_lists' },
  { key: 'estimates', table: 'estimates' },
  { key: 'orders', table: 'orders' },
  { key: 'invoices', table: 'invoices' },
] as const;

const WEBHOOK_GROUP_ENTITIES = ['locations', 'customers', 'products', 'transactions'] as const;
const WEBHOOK_GROUP_ENTITY_ALIASES: Record<(typeof WEBHOOK_GROUP_ENTITIES)[number], string[]> = {
  locations: ['locations'],
  customers: ['customers'],
  products: ['products', 'brands', 'categories', 'pricelists'],
  transactions: ['estimates', 'orders', 'invoices'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeWebhookEventType(eventType: string) {
  if (eventType.includes('created')) return 'create';
  if (eventType.includes('updated')) return 'update';
  if (eventType.includes('deleted')) return 'delete';
  return null;
}

function mapWebhookEntityGroup(entityType?: string | null): (typeof WEBHOOK_GROUP_ENTITIES)[number] | null {
  switch (entityType) {
    case 'locations':
    case 'warehouses':
      return 'locations';
    case 'contacts':
    case 'customers':
    case 'buyer_users':
      return 'customers';
    case 'items':
    case 'products':
    case 'brands':
    case 'categories':
    case 'price_lists':
    case 'pricelists':
      return 'products';
    case 'estimates':
    case 'orders':
    case 'salesorders':
    case 'invoices':
      return 'transactions';
    default:
      return null;
  }
}

function buildCoverageTotals(counts: Record<string, number>): import('@/types/integrations').IntegrationCoverageTotals {
  return {
    locations: counts.locations ?? 0,
    customers: counts.customers ?? 0,
    products: counts.products ?? 0,
    brands: counts.brands ?? 0,
    categories: counts.categories ?? 0,
    pricelists: counts.pricelists ?? 0,
    estimates: counts.estimates ?? 0,
    orders: counts.orders ?? 0,
    invoices: counts.invoices ?? 0,
    transactions: (counts.estimates ?? 0) + (counts.orders ?? 0) + (counts.invoices ?? 0),
  };
}

function buildWebhookTelemetry(
  webhookRows: Array<Record<string, unknown>>,
  eventRows: Array<Record<string, unknown>>,
  errorRows: Array<Record<string, unknown>>,
): import('@/types/integrations').IntegrationWebhookTelemetry {
  const entityStatuses: Record<(typeof WEBHOOK_GROUP_ENTITIES)[number], { active: boolean; create: boolean; update: boolean; delete: boolean; processed_last_24h: number; failed_last_24h: number; last_received_at?: string | null; last_verified_at?: string | null; }> = {
    locations: { active: false, create: false, update: false, delete: false, processed_last_24h: 0, failed_last_24h: 0 },
    customers: { active: false, create: false, update: false, delete: false, processed_last_24h: 0, failed_last_24h: 0 },
    products: { active: false, create: false, update: false, delete: false, processed_last_24h: 0, failed_last_24h: 0 },
    transactions: { active: false, create: false, update: false, delete: false, processed_last_24h: 0, failed_last_24h: 0 },
  };

  let status: import('@/types/integrations').IntegrationWebhookTelemetry['status'] = 'missing';

  for (const row of webhookRows) {
    const group = mapWebhookEntityGroup(typeof row.entity_type === 'string' ? row.entity_type : null);
    if (!group) continue;

    const entity = entityStatuses[group];
    entity.active = entity.active || row.status === 'active' || row.is_active === true;
    if (isNonEmptyString(row.last_received_at)) entity.last_received_at = row.last_received_at;
    if (isNonEmptyString(row.last_verified_at)) entity.last_verified_at = row.last_verified_at;

    const events = Array.isArray(row.event_types) ? row.event_types.filter((value): value is string => typeof value === 'string') : [];
    for (const eventType of events) {
      const kind = normalizeWebhookEventType(eventType);
      if (kind) entity[kind] = true;
    }
  }

  for (const row of eventRows) {
    const group = mapWebhookEntityGroup(typeof row.entity_type === 'string' ? row.entity_type : null);
    if (!group) continue;
    if (row.processing_status === 'processed') {
      entityStatuses[group].processed_last_24h += 1;
      status = status === 'missing' ? 'pending' : status;
    }
  }

  for (const row of errorRows) {
    const group = mapWebhookEntityGroup(typeof row.entity_type === 'string' ? row.entity_type : null);
    if (!group) continue;
    entityStatuses[group].failed_last_24h += 1;
  }

  const activeWebhookCount = webhookRows.filter((row) => row.status === 'active' || row.is_active === true).length;
  if (activeWebhookCount > 0) {
    status = 'active';
  } else if (webhookRows.length > 0) {
    status = webhookRows.some((row) => row.status === 'failed') ? 'failed' : 'pending';
  }

  return {
    status,
    total_processed_last_24h: Object.values(entityStatuses).reduce((sum, entity) => sum + entity.processed_last_24h, 0),
    total_failed_last_24h: Object.values(entityStatuses).reduce((sum, entity) => sum + entity.failed_last_24h, 0),
    entities: entityStatuses,
  };
}

async function countActiveRows(db: DbClient, table: string, tenantId: string) {
  const { count, error } = await db.schema('app').from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

function isJobRelevantForGroup(job: Record<string, unknown>, aliases: string[]) {
  const progress = isRecord(job.progress) ? job.progress : null;
  const summary = isRecord(job.summary) ? job.summary : null;
  const progressCounts = isRecord(progress?.counts) ? progress.counts : null;
  const summaryCounts = isRecord(summary?.counts) ? summary.counts : null;
  const phase = typeof progress?.phase === 'string' ? progress.phase : null;
  const phases = Array.isArray(progress?.phases) ? progress.phases.filter((value): value is string => typeof value === 'string') : [];

  return (
    aliases.some((alias) => Boolean(progressCounts?.[alias]) || Boolean(summaryCounts?.[alias])) ||
    (phase ? aliases.includes(phase) : false) ||
    aliases.some((alias) => phases.includes(alias))
  );
}

function requireAdminDb(): DbClient {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }
  return supabaseAdmin;
}

function scrubSecretConfig(config: Record<string, unknown>) {
  const next = { ...config };
  delete next.client_id;
  delete next.client_secret;
  delete next.refresh_token;
  delete next.bridge_token;
  return next;
}

function coerceRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function stripNullishFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== null && entry !== undefined)
      .map((entry) => stripNullishFields(entry)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, stripNullishFields(entry)]),
  ) as T;
}

function normalizeProgressCursor(raw: unknown): Record<string, unknown> | string | null {
  if (typeof raw === 'string') {
    return raw;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const cursor = raw as Record<string, unknown>;
  const phase = typeof cursor.phase === 'string' ? cursor.phase : null;
  const entityType = typeof cursor.entity_type === 'string' ? cursor.entity_type : null;
  const page = typeof cursor.page === 'number' ? cursor.page : null;
  const perPage = typeof cursor.per_page === 'number' ? cursor.per_page : null;
  const hasMore = typeof cursor.has_more === 'boolean' ? cursor.has_more : null;
  const since = typeof cursor.since === 'string' ? cursor.since : null;

  if (!phase || !entityType || page === null || perPage === null || hasMore === null) {
    return null;
  }

  return {
    phase,
    entity_type: entityType,
    page,
    per_page: perPage,
    has_more: hasMore,
    since,
  };
}

function normalizeIntegrationProgressRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const next = stripNullishFields({ ...raw });

  const itemsTotal = typeof next.items_total === 'number' ? next.items_total : null;
  const itemsProcessed = typeof next.items_processed === 'number' ? next.items_processed : null;
  const itemsFailed = typeof next.items_failed === 'number' ? next.items_failed : null;

  if (itemsTotal != null) {
    const normalizedTotal = Math.max(itemsTotal, itemsProcessed ?? 0, itemsFailed ?? 0);
    if (normalizedTotal !== itemsTotal) {
      next.items_total = normalizedTotal;
    }
  }

  const phasesTotal = typeof next.phases_total === 'number' ? next.phases_total : null;
  const phaseCurrent = typeof next.phase_current === 'number' ? next.phase_current : null;
  if (phasesTotal != null && phaseCurrent != null && phaseCurrent > phasesTotal) {
    next.phases_total = phaseCurrent;
  }

  if (typeof next.last_page === 'object' && next.last_page !== null && !Array.isArray(next.last_page)) {
    const lastPage = next.last_page as Record<string, unknown>;
    next.last_page = {
      ...lastPage,
      next_page: typeof lastPage.next_page === 'number' ? lastPage.next_page : null,
    };
  }

  next.cursor = normalizeProgressCursor(next.cursor);

  return next;
}

function normalizeRunOrigin(value: unknown): 'manual' | 'scheduled' | 'webhook' | null {
  return value === 'manual' || value === 'scheduled' || value === 'webhook' ? value : null;
}

function extractJobMetadata(row: Record<string, unknown>): {
  run_origin: 'manual' | 'scheduled' | 'webhook' | null;
  sync_window: string | null;
} {
  const progress = coerceRecord(row.progress);
  const summary = coerceRecord(row.summary);
  const progressMeta = coerceRecord(progress.meta);

  return {
    run_origin: normalizeRunOrigin(row.run_origin ?? progressMeta.run_origin ?? summary.run_origin),
    sync_window:
      typeof row.sync_window === 'string'
        ? row.sync_window
        : typeof progressMeta.sync_window === 'string'
          ? progressMeta.sync_window
          : typeof summary.sync_window === 'string'
            ? summary.sync_window
            : null,
  };
}

function getIntegrationsFunctionsBaseUrl() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  return `${supabaseUrl}/functions/v1`;
}

async function callIntegrationRuntime<T>(
  path: string,
  body: unknown,
  authHeader?: string | null,
): Promise<T> {
  const response = await fetch(`${getIntegrationsFunctionsBaseUrl()}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error ?? json?.message ?? `Request failed (${response.status})`);
  }

  return json as T;
}

async function assertTypeFlagEnabled(tenantId: string, typeId: IntegrationTypeId) {
  const familyFlag = TYPE_TO_FAMILY_FLAG[typeId];
  const enabled = await getFlag(FLAGS[familyFlag], tenantId);
  if (!enabled) {
    throw new Error('This integration is not enabled for your tenant');
  }
}

async function refreshZohoAccessToken(credentials: ZohoCredentials): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: credentials.refresh_token,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(ZOHO_TOKEN_URL, { method: 'POST', body });
  const json = (await response.json().catch(() => ({}))) as ZohoTokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error ?? json.message ?? 'Zoho token refresh failed');
  }
  return json.access_token;
}

async function zohoGet(
  path: string,
  accessToken: string,
  orgId: string,
  params: Record<string, string | number> = {},
) {
  const q = new URLSearchParams({
    organization_id: orgId,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const response = await fetch(`${ZOHO_BOOKS_API_BASE}${path}?${q}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.code !== 0) {
    throw new Error((json.message as string) ?? `Zoho request failed for ${path}`);
  }
  return json;
}

async function fetchZohoPage(
  entity: IntegrationEntityType,
  accessToken: string,
  orgId: string,
  page: number,
): Promise<ZohoListResult<Record<string, unknown>>> {
  const path = ENTITY_ENDPOINTS[entity];
  if (!path) return { rows: [], hasMore: false, page };

  const responseKey =
    entity === 'products'
      ? 'items'
      : entity === 'customers'
        ? 'contacts'
        : entity === 'orders'
          ? 'salesorders'
          : entity === 'invoices'
            ? 'invoices'
            : 'estimates';

  const json = await zohoGet(path, accessToken, orgId, {
    per_page: ZOHO_DEFAULT_PER_PAGE,
    page,
    sort_column: 'last_modified_time',
    sort_order: 'D',
  });
  const rows = Array.isArray(json[responseKey]) ? (json[responseKey] as Record<string, unknown>[]) : [];
  const hasMore = Boolean((json.page_context as { has_more_page?: boolean } | undefined)?.has_more_page);
  return { rows, hasMore, page };
}

async function countZohoEntity(entity: IntegrationEntityType, credentials: ZohoCredentials): Promise<number> {
  const path = ENTITY_ENDPOINTS[entity];
  if (!path) return 0;

  const accessToken = await refreshZohoAccessToken(credentials);
  let page = 1;
  let total = 0;
  for (;;) {
    const batch = await fetchZohoPage(entity, accessToken, credentials.org_id, page);
    total += batch.rows.length;
    if (!batch.hasMore || batch.rows.length === 0) break;
    page += 1;
  }
  return total;
}

async function probeZohoConnection(typeId: IntegrationTypeId, credentials: ZohoCredentials) {
  const accessToken = await refreshZohoAccessToken(credentials);
  const orgsResponse = await fetch(`${ZOHO_BOOKS_API_BASE}/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const orgsJson = (await orgsResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!orgsResponse.ok || orgsJson.code !== 0) {
    throw new Error((orgsJson.message as string) ?? 'Failed to load Zoho organizations');
  }

  const orgs = Array.isArray(orgsJson.organizations)
    ? (orgsJson.organizations as Array<Record<string, unknown>>)
    : [];
  const matchingOrg =
    orgs.find((org) => String(org.organization_id ?? '') === credentials.org_id) ?? orgs[0] ?? null;

  const countableEntities = TYPE_TO_ENTITIES[typeId];
  const counts = await Promise.all(
    countableEntities.map(async (entity) => [entity, await countZohoEntity(entity, credentials)] as const),
  );

  return {
    organization_name: matchingOrg ? String(matchingOrg.name ?? matchingOrg.organization_name ?? 'Zoho Organization') : 'Zoho Organization',
    discovered_counts: Object.fromEntries(counts),
  };
}

function buildInitialProgress(
  jobId: string,
  entities: IntegrationEntityType[],
  importOrdersSince?: string,
): IntegrationProgress {
  return IntegrationProgressSchema.parse({
    mode: 'initial_import',
    phase: 'queued',
    phase_label: 'Queued for import',
    phases_total: entities.length,
    phase_current: 1,
    current_page: 1,
    items_total: null,
    items_processed: 0,
    items_failed: 0,
    eta_seconds_remaining: null,
    meta: {
      job_id: jobId,
      import_orders_since: importOrdersSince ?? null,
      entities,
    },
  });
}

async function updateJob(
  db: DbClient,
  jobId: string,
  patch: {
    status?: 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    progress?: IntegrationProgress;
    summary?: IntegrationJobSummary;
    error_log?: Array<Record<string, unknown>>;
    started_at?: string | null;
    completed_at?: string | null;
    updated_by?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.progress) update.progress = patch.progress;
  if (patch.summary) update.summary = patch.summary;
  if (patch.error_log) update.error_log = patch.error_log;
  if (patch.started_at !== undefined) update.started_at = patch.started_at;
  if (patch.completed_at !== undefined) update.completed_at = patch.completed_at;
  if (patch.updated_by !== undefined) update.updated_by = patch.updated_by;
  const { error } = await db.schema('app').from('integration_sync_jobs').update(update).eq('id', jobId);
  if (error) throw error;
}

export async function loadIntegrationsSettingsPayload(tenantId: string) {
  const db = requireAdminDb();
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: types, error: typeErr },
    { data: integrations, error: integrationErr },
    { data: jobs, error: jobErr },
    { data: flows, error: flowErr },
    { data: webhooks, error: webhookErr },
    { data: webhookEvents, error: webhookEventErr },
    { data: webhookErrors, error: webhookErrorErr },
    { data: entityErrors, error: entityErrorErr },
  ] = await Promise.all([
    db.schema('catalog').from('integration_types').select('id, display_name, description, logo_url, auth_schema, capabilities, connectivity_mode, is_active').eq('is_active', true).order('display_name'),
    db.schema('app').from('tenant_integrations').select('id, tenant_id, integration_type_id, status, config, last_health_check_at, health_status, connected_at, connected_by, created_at, updated_at').eq('tenant_id', tenantId).is('deleted_at', null),
    db.schema('app').from('integration_sync_jobs').select('id, tenant_integration_id, job_type, phase, status, progress, error_log, summary, since_date, started_at, completed_at, created_at').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }),
    db.schema('app').from('integration_data_flows').select('id, tenant_integration_id, entity_type, direction, trigger_type, schedule, webhook_id, field_mappings, filters, is_active, last_run_at').eq('tenant_id', tenantId).is('deleted_at', null),
    db.schema('app').from('integration_webhooks').select('tenant_integration_id, entity_type, event_types, status, is_active, last_received_at, last_verified_at').eq('tenant_id', tenantId).is('deleted_at', null),
    db.schema('app').from('integration_webhook_events').select('tenant_integration_id, entity_type, processing_status, received_at').eq('tenant_id', tenantId).gte('received_at', sinceIso).is('deleted_at', null),
    db.schema('app').from('integration_webhook_errors').select('tenant_integration_id, entity_type, created_at').eq('tenant_id', tenantId).gte('created_at', sinceIso).is('deleted_at', null),
    db.schema('app').from('integration_entity_map').select('tenant_integration_id, entity_type, external_id, error_reason, updated_at').eq('tenant_id', tenantId).not('error_reason', 'is', null).is('deleted_at', null).order('updated_at', { ascending: false }).limit(50),
  ]);

  if (typeErr || integrationErr || jobErr || flowErr || webhookErr || webhookEventErr || webhookErrorErr || entityErrorErr) {
    throw new Error('Failed to load integrations');
  }

  const coverageCounts = Object.fromEntries(
    await Promise.all(
      COVERAGE_TABLES.map(async ({ key, table }) => {
        const count = await countActiveRows(db, table, tenantId);
        return [key, count] as const;
      }),
    ),
  ) as Record<string, number>;
  const coverageTotals = buildCoverageTotals(coverageCounts);

  const integrationMap = new Map((integrations ?? []).map((row: Record<string, unknown>) => [String(row.integration_type_id), row]));
  // A sync run creates one job row PER PHASE, all with near-identical created_at.
  // The "active" job must be the one actually in progress, not just whichever
  // phase row happens to sort first — otherwise the UI can end up representing
  // an in-flight run with a phase that hasn't started yet (still 'pending').
  const JOB_STATUS_PRIORITY: Record<string, number> = { running: 0, queued: 1, pending: 1, paused: 2 };
  // Recent history needs to cover multiple resume attempts across 7 phases —
  // 10 was tight enough that a single run's fresh rows could push out the
  // "last completed" rows the UI needs for per-phase fallback counts.
  const RECENT_JOBS_LIMIT = 60;
  const latestJobMap = new Map<string, Record<string, unknown>>();
  const recentJobsMap = new Map<string, Record<string, unknown>[]>();
  for (const row of jobs ?? []) {
    const key = String((row as Record<string, unknown>).tenant_integration_id ?? '');
    if (key) {
      const existing = latestJobMap.get(key);
      const rowPriority = JOB_STATUS_PRIORITY[String((row as Record<string, unknown>).status ?? '')] ?? 3;
      const existingPriority = existing ? JOB_STATUS_PRIORITY[String(existing.status ?? '')] ?? 3 : 4;
      if (!existing || rowPriority < existingPriority) latestJobMap.set(key, row as Record<string, unknown>);

      const bucket = recentJobsMap.get(key) ?? [];
      if (bucket.length < RECENT_JOBS_LIMIT) bucket.push(row as Record<string, unknown>);
      recentJobsMap.set(key, bucket);
    }
  }

  const flowMap = new Map<string, Record<string, unknown>[]>();
  for (const flow of flows ?? []) {
    const key = String((flow as Record<string, unknown>).tenant_integration_id ?? '');
    if (!flowMap.has(key)) flowMap.set(key, []);
    flowMap.get(key)?.push(flow as Record<string, unknown>);
  }

  const webhookMap = new Map<string, Record<string, unknown>[]>();
  for (const row of webhooks ?? []) {
    const key = String((row as Record<string, unknown>).tenant_integration_id ?? '');
    if (!key) continue;
    const bucket = webhookMap.get(key) ?? [];
    bucket.push(row as Record<string, unknown>);
    webhookMap.set(key, bucket);
  }

  const webhookEventMap = new Map<string, Record<string, unknown>[]>();
  for (const row of webhookEvents ?? []) {
    const key = String((row as Record<string, unknown>).tenant_integration_id ?? '');
    if (!key) continue;
    const bucket = webhookEventMap.get(key) ?? [];
    bucket.push(row as Record<string, unknown>);
    webhookEventMap.set(key, bucket);
  }

  const webhookErrorMap = new Map<string, Record<string, unknown>[]>();
  for (const row of webhookErrors ?? []) {
    const key = String((row as Record<string, unknown>).tenant_integration_id ?? '');
    if (!key) continue;
    const bucket = webhookErrorMap.get(key) ?? [];
    bucket.push(row as Record<string, unknown>);
    webhookErrorMap.set(key, bucket);
  }

  const entityErrorMap = new Map<string, Record<string, unknown>[]>();
  for (const row of entityErrors ?? []) {
    const key = String((row as Record<string, unknown>).tenant_integration_id ?? '');
    if (!key) continue;
    const bucket = entityErrorMap.get(key) ?? [];
    bucket.push(row as Record<string, unknown>);
    entityErrorMap.set(key, bucket);
  }

  const payload = IntegrationSettingsPayloadSchema.parse({
    catalog: (types ?? []).map((typeRow: Record<string, unknown>) => {
      const integrationRow = integrationMap.get(String(typeRow.id)) ?? null;
      const integrationId = integrationRow ? String(integrationRow.id) : null;
      const latestJob = integrationId ? latestJobMap.get(integrationId) ?? null : null;
      const activeFlows = integrationId ? flowMap.get(integrationId) ?? [] : [];
      const tenantWebhooks = integrationId ? webhookMap.get(integrationId) ?? [] : [];
      const tenantWebhookEvents = integrationId ? webhookEventMap.get(integrationId) ?? [] : [];
      const tenantWebhookErrors = integrationId ? webhookErrorMap.get(integrationId) ?? [] : [];
      const tenantEntityErrors = integrationId ? entityErrorMap.get(integrationId) ?? [] : [];
      return {
        type: {
          ...typeRow,
          auth_schema: IntegrationAuthSchemaSchema.parse(coerceRecord(typeRow.auth_schema)),
          capabilities: IntegrationCapabilitiesSchema.parse(coerceRecord(typeRow.capabilities)),
        },
        integration: integrationRow
          ? {
              ...integrationRow,
              status: IntegrationStatusSchema.parse(integrationRow.status),
              config: coerceRecord(integrationRow.config),
            }
          : null,
        latest_job: latestJob
          ? {
              ...latestJob,
              ...extractJobMetadata(latestJob),
              progress: IntegrationProgressSchema.parse(normalizeIntegrationProgressRecord(coerceRecord(latestJob.progress))),
              summary: latestJob.summary ? IntegrationJobSummarySchema.parse(coerceRecord(latestJob.summary)) : null,
              error_log: normalizeIntegrationJobErrorLog(latestJob.error_log),
            }
          : null,
        recent_jobs: integrationId
          ? (recentJobsMap.get(integrationId) ?? []).map((row) => ({
              ...row,
              ...extractJobMetadata(row),
              progress: IntegrationProgressSchema.parse(normalizeIntegrationProgressRecord(coerceRecord(row.progress))),
              summary: row.summary ? IntegrationJobSummarySchema.parse(coerceRecord(row.summary)) : null,
              error_log: normalizeIntegrationJobErrorLog(row.error_log),
            }))
          : [],
        active_flows: activeFlows,
        recent_entity_errors: tenantEntityErrors
          .map((row) => ({
            entity_type: String(row.entity_type ?? ''),
            external_id: typeof row.external_id === 'string' ? row.external_id : null,
            error_reason: String(row.error_reason ?? ''),
            updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
          }))
          .filter((row) => row.entity_type.length > 0 && row.error_reason.length > 0),
        coverage_totals: coverageTotals,
        webhook_telemetry: integrationId
          ? buildWebhookTelemetry(tenantWebhooks, tenantWebhookEvents, tenantWebhookErrors)
          : null,
      } as unknown as IntegrationCatalogItem;
    }),
  });

  return payload;
}

export async function testIntegrationConnection(tenantId: string, body: unknown, authHeader?: string | null) {
  const parsed = IntegrationTestRequestSchema.parse(body);
  await assertTypeFlagEnabled(tenantId, parsed.integration_type_id);

  return callIntegrationRuntime<{ ok: boolean; integration_type_id: string; meta: Record<string, unknown> }>(
    'integrations-test',
    parsed,
    authHeader,
  );
}

export async function connectTenantIntegration(tenantId: string, actorUserId: string, body: unknown, authHeader?: string | null) {
  const parsed = IntegrationConnectRequestSchema.parse(body);
  await assertTypeFlagEnabled(tenantId, parsed.integration_type_id);

  await callIntegrationRuntime<{ ok: boolean; tenant_integration_id: string; status: string; health_status: string | null; config: Record<string, unknown>; meta: Record<string, unknown> }>(
    'integrations-connect',
    { ...parsed, tenant_id: tenantId, actor_user_id: actorUserId, config: scrubSecretConfig(parsed.config) },
    authHeader,
  );

  return loadIntegrationsSettingsPayload(tenantId);
}

export async function disconnectTenantIntegration(
  tenantId: string,
  actorUserId: string,
  body: unknown,
  authHeader?: string | null,
) {
  const record = coerceRecord(body);
  const tenantIntegrationId = typeof record.tenant_integration_id === 'string' ? record.tenant_integration_id : null;
  if (!tenantIntegrationId) {
    throw new Error('tenant_integration_id is required');
  }

  await callIntegrationRuntime<{ ok: boolean; tenant_integration_id: string; status: string }>(
    'integrations-disconnect',
    {
      tenant_integration_id: tenantIntegrationId,
      tenant_id: tenantId,
      actor_user_id: actorUserId,
    },
    authHeader,
  );

  return loadIntegrationsSettingsPayload(tenantId);
}

async function getTenantIntegrationWithSecret(db: DbClient, tenantIntegrationId: string, tenantId: string) {
  const { data: integration, error } = await db
    .schema('app')
    .from('tenant_integrations')
    .select('id, integration_type_id, config, status')
    .eq('id', tenantIntegrationId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single();
  if (error || !integration) throw error ?? new Error('Integration not found');

  const { data: secret, error: secretError } = await db
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: tenantIntegrationId,
      p_expected_integration_type_id: integration.integration_type_id,
    });
  if (secretError) throw new Error(secretError.message ?? 'Failed to load integration secret');
  return { integration, secret: secret as Record<string, unknown> | null };
}

export async function startIntegrationSync(tenantId: string, actorUserId: string, body: unknown, authHeader?: string | null) {
  const parsed = IntegrationSyncRequestSchema.parse(body);
  return callIntegrationRuntime<{ ok: boolean; job_id: string; tenant_integration_id: string; status: string; progress: Record<string, unknown> }>(
    'integrations-sync',
    { ...parsed, tenant_id: tenantId, actor_user_id: actorUserId },
    authHeader,
  );
}

export async function cancelIntegrationSync(tenantId: string, actorUserId: string, body: unknown, authHeader?: string | null) {
  const record = coerceRecord(body);
  const tenantIntegrationId = typeof record.tenant_integration_id === 'string' ? record.tenant_integration_id : null;
  if (!tenantIntegrationId) {
    throw new Error('tenant_integration_id is required');
  }

  const db = requireAdminDb();
  const { error } = await db.schema('app').rpc('cancel_tenant_integration_sync_job', {
    p_tenant_integration_id: tenantIntegrationId,
    p_actor_user_id: actorUserId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to cancel sync');
  }

  return loadIntegrationsSettingsPayload(tenantId);
}

export async function runIntegrationSyncJob(jobId: string, tenantId: string, actorUserId?: string | null) {
  const db = requireAdminDb();
  const { data: job, error } = await db
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, tenant_id, tenant_integration_id, job_type, progress')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !job) throw error ?? new Error('Sync job not found');

  const { integration, secret } = await getTenantIntegrationWithSecret(db, job.tenant_integration_id as string, tenantId);
  if (!secret) throw new Error('Integration secret not found');

  const typeId = integration.integration_type_id as IntegrationTypeId;
  if (typeId === 'tally_prime' || typeId === 'busy') {
    await updateJob(db, jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_log: [{ message: 'Local bridge sync is not implemented yet.' }],
      updated_by: actorUserId ?? null,
    });
    return;
  }

  const credentials = secret as ZohoCredentials;
  const accessToken = await refreshZohoAccessToken(credentials);
  const entities = TYPE_TO_ENTITIES[typeId];
  const summary: IntegrationJobSummary = {};
  const startedAt = new Date().toISOString();

  await db.schema('app').from('tenant_integrations').update({
    status: 'syncing',
    updated_by: actorUserId ?? null,
  }).eq('id', integration.id);

  await updateJob(db, jobId, {
    status: 'running',
    started_at: startedAt,
    progress: IntegrationProgressSchema.parse({
      ...(coerceRecord(job.progress)),
      phase: entities[0] ?? 'products',
      phase_label: `Preparing ${entities[0] ?? 'products'} import`,
      phases_total: entities.length,
      phase_current: 1,
      started_at: startedAt,
      updated_at: startedAt,
    }),
    updated_by: actorUserId ?? null,
  });

  const errors: Array<Record<string, unknown>> = [];
  for (let phaseIndex = 0; phaseIndex < entities.length; phaseIndex += 1) {
    const entity = entities[phaseIndex];
    let processed = 0;
    let page = 1;
    let brandSet = new Set<string>();
    let hasMore = true;

    while (hasMore) {
      const batch = await fetchZohoPage(entity, accessToken, credentials.org_id, page);
      processed += batch.rows.length;
      if (entity === 'products') {
        for (const row of batch.rows) {
          const brand = typeof row.brand === 'string' ? row.brand.trim() : '';
          if (brand) brandSet.add(brand);
        }
      }

      await updateJob(db, jobId, {
        progress: IntegrationProgressSchema.parse({
          mode: 'initial_import',
          phase: entity,
          phase_label: `Importing ${entity}...`,
          phases_total: entities.length,
          phase_current: phaseIndex + 1,
          current_entity: entity,
          current_page: page,
          total_pages_estimate: batch.hasMore ? page + 1 : page,
          items_total: null,
          items_processed: processed,
          items_failed: 0,
          last_batch_size: batch.rows.length,
          cursor: batch.hasMore ? String(page + 1) : null,
          eta_seconds_remaining: null,
          started_at: startedAt,
          updated_at: new Date().toISOString(),
        }),
        updated_by: actorUserId ?? null,
      });

      hasMore = batch.hasMore && batch.rows.length > 0;
      page += 1;
    }

    if (entity === 'products') {
      summary.brands = brandSet.size;
    }
    (summary as Record<string, number | undefined>)[entity] = processed;
  }

  await updateJob(db, jobId, {
    status: 'completed',
    summary: IntegrationJobSummarySchema.parse(summary),
    completed_at: new Date().toISOString(),
    progress: IntegrationProgressSchema.parse({
      mode: 'initial_import',
      phase: 'complete',
      phase_label: 'Import completed',
      phases_total: entities.length,
      phase_current: entities.length,
      current_entity: entities[entities.length - 1] ?? 'products',
      current_page: 1,
      total_pages_estimate: 1,
      items_total: Object.values(summary).reduce<number>((acc, value) => acc + (typeof value === 'number' ? value : 0), 0),
      items_processed: Object.values(summary).reduce<number>((acc, value) => acc + (typeof value === 'number' ? value : 0), 0),
      items_failed: errors.length,
      eta_seconds_remaining: 0,
      started_at: startedAt,
      updated_at: new Date().toISOString(),
    }),
    error_log: errors.length > 0 ? errors : undefined,
    updated_by: actorUserId ?? null,
  });

  await db.schema('app').from('tenant_integrations').update({
    status: 'connected',
    config: {
      ...coerceRecord(integration.config),
      last_sync_summary: summary,
    },
    updated_by: actorUserId ?? null,
  }).eq('id', integration.id);

  return loadIntegrationsSettingsPayload(tenantId);
}
