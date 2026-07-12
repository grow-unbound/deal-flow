'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';

import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { normalizeIntegrationJobErrorLog } from '@/lib/integrations/job-error-log';
import { resolvePhasesForPolicy, resolveSyncEnrichmentPolicy } from '@/lib/integrations/sync-orchestration';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { makeHttpError, transientQueryRetry } from '@/lib/query-retry';
import type {
  IntegrationCoverageTotals,
  IntegrationEntityError,
  IntegrationSettingsPayload,
  IntegrationWebhookTelemetry,
} from '@/types/integrations';

export type { IntegrationEntityError } from '@/types/integrations';

export type IntegrationFamilyFlag = 'ZOHO_INTEGRATION' | 'TALLY_INTEGRATION' | 'BUSY_INTEGRATION';
export type IntegrationConnectivityMode = 'cloud' | 'local';
export type TenantIntegrationStatus = 'pending_setup' | 'connected' | 'syncing' | 'sync_failed' | 'disconnected';
export type IntegrationHealthStatus = 'ok' | 'expired' | 'invalid' | null;
export type IntegrationRunOrigin = 'manual' | 'scheduled' | 'webhook' | null;
export type IntegrationSyncJobType = 'initial_reference' | 'initial_transactional' | 'incremental' | 'manual';
export type IntegrationSyncJobStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type IntegrationTriggerType = 'webhook' | 'scheduled' | 'event';
export type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';
export type IntegrationAggregateFreshnessStatus = 'fresh' | 'warning' | 'stale' | 'failed' | 'unknown';

export interface IntegrationAuthField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'url' | 'number' | 'select' | 'textarea';
  required?: boolean;
  help?: string;
  placeholder?: string;
}

export interface IntegrationAuthSchema {
  oauth?: boolean;
  fields?: IntegrationAuthField[];
}

export interface IntegrationCapabilities {
  inbound_reference?: string[];
  inbound_transactional?: string[];
  outbound_reference?: string[];
  outbound_transactional?: string[];
  webhooks?: boolean;
}

export interface IntegrationSyncProgress {
  version?: number;
  provider?: string;
  scope?: 'reference' | 'transactional' | 'full';
  since?: string | null;
  phases?: string[];
  phase?: string | null;
  phase_label?: string | null;
  phases_total?: number | null;
  phase_current?: number | null;
  items_total?: number | null;
  items_processed?: number | null;
  items_failed?: number | null;
  pages_processed?: number | null;
  cursor?: string | null;
  counts?: Record<string, IntegrationSyncPhaseStats> | null;
  started_at?: string | null;
  updated_at?: string | null;
  last_page?: {
    phase: string;
    count: number;
    next_page: number | null;
    completed_at: string;
    sample_ids?: string[];
  } | null;
  note?: string | null;
  phases_in_run?: string[] | null;
}

export interface IntegrationSyncPhaseStats {
  entity_type: string;
  processed: number;
  failed: number;
  pages: number;
}

export interface IntegrationSyncError {
  timestamp: string | null;
  entity_type: string | null;
  external_id: string | null;
  error: string | null;
}

export interface IntegrationSyncJob {
  id: string;
  job_type: IntegrationSyncJobType;
  phase?: string | null;
  status: IntegrationSyncJobStatus;
  run_origin?: IntegrationRunOrigin;
  sync_window?: string | null;
  since_date?: string | null;
  progress?: IntegrationSyncProgress | null;
  error_log?: IntegrationSyncError[] | null;
  summary?: IntegrationJobSummary | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  master_job_id?: string | null;
  heartbeat_at?: string | null;
  records_synced?: number | null;
}

export interface IntegrationJobSummary {
  provider?: string;
  scope?: 'reference' | 'transactional' | 'full';
  since?: string | null;
  run_origin?: IntegrationRunOrigin;
  sync_window?: string | null;
  phases_completed?: string[];
  counts?: Record<string, IntegrationSyncPhaseStats>;
  last_synced_at?: string | null;
  note?: string;
  brands?: number;
  products?: number;
  customers?: number;
  estimates?: number;
  orders?: number;
  invoices?: number;
  total_processed?: number;
  total_failed?: number;
  duration_ms?: number;
  warnings?: string[];
  [key: string]: unknown;
}

export interface IntegrationDataFlow {
  id: string;
  entity_type: string;
  direction: IntegrationDirection;
  trigger_type: IntegrationTriggerType;
  schedule?: string | null;
  field_mappings: Record<string, unknown>;
  filters: Record<string, unknown>;
  is_active: boolean;
  last_run_at?: string | null;
}

export interface IntegrationAggregateFreshness {
  status: IntegrationAggregateFreshnessStatus;
  latest_snapshot_refreshed_at?: string | null;
  latest_kpi_updated_at?: string | null;
  latest_analysis_at?: string | null;
  latest_sync_completed_at?: string | null;
  latest_aggregate_at?: string | null;
  repair_job_id?: string | null;
  repair_rebuild_days?: number | null;
  last_retried_at?: string | null;
  warning_message?: string | null;
}

export interface TenantIntegrationDetail {
  id: string;
  status: TenantIntegrationStatus;
  health_status?: IntegrationHealthStatus;
  connected_at?: string | null;
  last_health_check_at?: string | null;
  config?: Record<string, unknown>;
  active_job?: IntegrationSyncJob | null;
  sync_history: IntegrationSyncJob[];
  data_flows: IntegrationDataFlow[];
  recent_entity_errors?: IntegrationEntityError[];
  coverage_totals?: IntegrationCoverageTotals | null;
  webhook_telemetry?: IntegrationWebhookTelemetry | null;
  aggregate_freshness?: IntegrationAggregateFreshness | null;
}

export interface IntegrationCatalogItem {
  id: string;
  display_name: string;
  description: string;
  family_flag: IntegrationFamilyFlag;
  connectivity_mode: IntegrationConnectivityMode;
  auth_schema?: IntegrationAuthSchema | null;
  capabilities?: IntegrationCapabilities | null;
  logo_url?: string | null;
  tenant_integration?: TenantIntegrationDetail | null;
  setup_notes?: string[];
  coverage_totals?: IntegrationCoverageTotals | null;
  webhook_telemetry?: IntegrationWebhookTelemetry | null;
  recent_entity_errors?: IntegrationEntityError[];
  aggregate_freshness?: IntegrationAggregateFreshness | null;
}

export interface IntegrationsSettingsView {
  integrations: IntegrationCatalogItem[];
  last_updated_at?: string | null;
}

export interface IntegrationTestResult {
  ok: boolean;
  connection_label?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  sample_counts?: Record<string, number> | null;
  warnings?: string[] | null;
}

export interface StartImportResult {
  integration_type_id: string;
  tenant_integration_id?: string | null;
  job_id?: string | null;
}

export interface TestConnectionInput {
  integration_type_id: string;
  credentials: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface StartImportInput extends TestConnectionInput {
  tenant_integration_id: string;
  import_start_date: string;
}

export interface SyncNowInput {
  tenant_integration_id: string;
  phase?: string;
  max_pages?: number;
  since?: string;
  force_full_refresh?: boolean;
}

export interface StopSyncInput {
  tenant_integration_id: string;
}

export interface RepairAggregatesInput {
  tenant_integration_id: string;
  start_date?: string;
  end_date?: string;
  include_snapshots?: boolean;
  include_kpis?: boolean;
}

export interface RunAnalysisInput {
  tenant_integration_id: string;
  days?: number;
}

interface ApiEnvelope<T> {
  data: T | null;
  error?: { code?: string; message?: string } | null;
}

const ACTIVE_STATUSES: IntegrationSyncJobStatus[] = ['pending', 'queued', 'running', 'paused'];
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePhaseStats(value: unknown): IntegrationSyncPhaseStats | null {
  if (!isRecord(value)) return null;
  const processed = asNumber(value.processed);
  const failed = asNumber(value.failed);
  const pages = asNumber(value.pages);

  if (processed === null && failed === null && pages === null) return null;

  return {
    entity_type: asString(value.entity_type, ''),
    processed: processed ?? 0,
    failed: failed ?? 0,
    pages: pages ?? 0,
  };
}

function normalizePhaseStatsRecord(value: unknown): Record<string, IntegrationSyncPhaseStats> | null {
  if (!isRecord(value)) return null;

  const entries = Object.entries(value)
    .map(([key, stat]) => [key, normalizePhaseStats(stat)] as const)
    .filter((entry): entry is readonly [string, IntegrationSyncPhaseStats] => entry[1] !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeSummary(value: unknown): IntegrationJobSummary | null {
  if (!isRecord(value)) return null;

  const counts = normalizePhaseStatsRecord(value.counts);
  const phasesCompleted = asArray<unknown>(value.phases_completed).filter((phase): phase is string => typeof phase === 'string');
  const warnings = asArray<unknown>(value.warnings).filter((warning): warning is string => typeof warning === 'string');

  const summary: IntegrationJobSummary = {
    ...value,
    provider: asNullableString(value.provider) ?? undefined,
    scope:
      value.scope === 'reference' || value.scope === 'transactional' || value.scope === 'full'
        ? value.scope
        : undefined,
    since: typeof value.since === 'string' || value.since === null ? (value.since as string | null) : undefined,
    run_origin:
      value.run_origin === 'manual' || value.run_origin === 'scheduled' || value.run_origin === 'webhook'
        ? value.run_origin
        : undefined,
    sync_window: asNullableString(value.sync_window) ?? undefined,
    phases_completed: phasesCompleted.length > 0 ? phasesCompleted : undefined,
    counts: counts ?? undefined,
    last_synced_at: asNullableString(value.last_synced_at) ?? undefined,
    note: asNullableString(value.note) ?? undefined,
    brands: asNumber(value.brands) ?? undefined,
    products: asNumber(value.products) ?? undefined,
    customers: asNumber(value.customers) ?? undefined,
    estimates: asNumber(value.estimates) ?? undefined,
    orders: asNumber(value.orders) ?? undefined,
    invoices: asNumber(value.invoices) ?? undefined,
    total_processed: asNumber(value.total_processed) ?? undefined,
    total_failed: asNumber(value.total_failed) ?? undefined,
    duration_ms: asNumber(value.duration_ms) ?? undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return summary;
}

function inferFamilyFlag(id: string): IntegrationFamilyFlag {
  if (id.startsWith('zoho_')) return 'ZOHO_INTEGRATION';
  if (id === 'tally_prime') return 'TALLY_INTEGRATION';
  return 'BUSY_INTEGRATION';
}

function normalizeRunOrigin(value: unknown): IntegrationRunOrigin {
  return value === 'manual' || value === 'scheduled' || value === 'webhook' ? value : null;
}

function parseSyncJob(value: unknown): IntegrationSyncJob | null {
  if (!isRecord(value)) return null;

  const progressMeta = isRecord(value.progress) && isRecord(value.progress.meta) ? value.progress.meta : null;
  const summary = normalizeSummary(value.summary);
  const runOrigin = normalizeRunOrigin(value.run_origin ?? progressMeta?.run_origin ?? summary?.run_origin);
  const syncWindow = asNullableString(value.sync_window ?? progressMeta?.sync_window ?? summary?.sync_window) ?? null;

  return {
    id: asString(value.id),
    job_type: (asString(value.job_type) || 'manual') as IntegrationSyncJobType,
    phase: asNullableString(value.phase) ?? null,
    status: (asString(value.status) || 'queued') as IntegrationSyncJobStatus,
    run_origin: runOrigin,
    sync_window: syncWindow,
    progress: isRecord(value.progress)
      ? {
          version: asNumber(value.progress.version) ?? undefined,
          provider: asNullableString(value.progress.provider) ?? undefined,
          scope:
            value.progress.scope === 'reference' || value.progress.scope === 'transactional' || value.progress.scope === 'full'
              ? value.progress.scope
              : undefined,
          since: typeof value.progress.since === 'string' || value.progress.since === null ? (value.progress.since as string | null) : undefined,
          phases: asArray<unknown>(value.progress.phases).filter((phase): phase is string => typeof phase === 'string'),
          phase: asNullableString(value.progress.phase),
          phase_label: asNullableString(value.progress.phase_label),
          phases_total: asNumber(value.progress.phases_total),
          phase_current: asNumber(value.progress.phase_current),
          items_total: asNumber(value.progress.items_total),
          items_processed: asNumber(value.progress.items_processed),
          items_failed: asNumber(value.progress.items_failed),
          pages_processed: asNumber(value.progress.pages_processed),
          cursor: asNullableString(value.progress.cursor),
          counts: normalizePhaseStatsRecord(value.progress.counts),
          started_at: asNullableString(value.progress.started_at) ?? undefined,
          updated_at: asNullableString(value.progress.updated_at) ?? undefined,
          last_page: isRecord(value.progress.last_page)
            ? {
                phase: asString(value.progress.last_page.phase),
                count: asNumber(value.progress.last_page.count) ?? 0,
                next_page: typeof value.progress.last_page.next_page === 'number' ? value.progress.last_page.next_page : null,
                completed_at: asString(value.progress.last_page.completed_at, ''),
                sample_ids: asArray<unknown>(value.progress.last_page.sample_ids).filter(
                  (sampleId): sampleId is string => typeof sampleId === 'string',
                ),
              }
            : null,
          note: asNullableString(value.progress.note),
          phases_in_run: asArray<unknown>(value.progress.phases_in_run).filter(
            (phase): phase is string => typeof phase === 'string',
          ),
        }
      : null,
    error_log: normalizeIntegrationJobErrorLog(value.error_log)
      .map((entry) =>
        isRecord(entry)
          ? {
              timestamp: asNullableString(entry.timestamp),
              entity_type: asNullableString(entry.entity_type),
              external_id: asNullableString(entry.external_id),
              error: asNullableString(entry.error),
            }
          : null,
      )
      .filter((entry): entry is IntegrationSyncError => entry !== null),
    summary,
    since_date: asNullableString(value.since_date),
    started_at: asNullableString(value.started_at),
    completed_at: asNullableString(value.completed_at),
    created_at: asString(value.created_at, new Date(0).toISOString()),
    master_job_id: asNullableString(value.master_job_id),
    heartbeat_at: asNullableString(value.heartbeat_at),
    records_synced: asNumber(value.records_synced),
  };
}

function parseDataFlow(value: unknown): IntegrationDataFlow | null {
  if (!isRecord(value)) return null;

  return {
    id: asString(value.id),
    entity_type: asString(value.entity_type),
    direction: (asString(value.direction) || 'inbound') as IntegrationDirection,
    trigger_type: (asString(value.trigger_type) || 'scheduled') as IntegrationTriggerType,
    schedule: asNullableString(value.schedule),
    field_mappings: isRecord(value.field_mappings) ? value.field_mappings : {},
    filters: isRecord(value.filters) ? value.filters : {},
    is_active: value.is_active !== false,
    last_run_at: asNullableString(value.last_run_at),
  };
}

function parseAggregateFreshness(value: unknown): IntegrationAggregateFreshness | null {
  if (!isRecord(value)) return null;

  const status = asString(value.status) as IntegrationAggregateFreshnessStatus;
  if (!status) return null;

  return {
    status,
    latest_snapshot_refreshed_at: asNullableString(value.latest_snapshot_refreshed_at),
    latest_kpi_updated_at: asNullableString(value.latest_kpi_updated_at),
    latest_analysis_at: asNullableString(value.latest_analysis_at),
    latest_sync_completed_at: asNullableString(value.latest_sync_completed_at),
    latest_aggregate_at: asNullableString(value.latest_aggregate_at),
    repair_job_id: asNullableString(value.repair_job_id),
    repair_rebuild_days: asNumber(value.repair_rebuild_days),
    last_retried_at: asNullableString(value.last_retried_at),
    warning_message: asNullableString(value.warning_message),
  };
}

function parseTenantIntegration(value: unknown): TenantIntegrationDetail | null {
  if (!isRecord(value)) return null;

  const history = asArray<unknown>(value.sync_history)
    .map(parseSyncJob)
    .filter((job): job is IntegrationSyncJob => job !== null);

  const parsedJob = parseSyncJob(value.active_job);
  const activeJob = parsedJob && ACTIVE_STATUSES.includes(parsedJob.status) ? parsedJob : null;

  return {
    id: asString(value.id),
    status: (asString(value.status) || 'pending_setup') as TenantIntegrationStatus,
    health_status: (asNullableString(value.health_status) as IntegrationHealthStatus) ?? null,
    connected_at: asNullableString(value.connected_at),
    last_health_check_at: asNullableString(value.last_health_check_at),
    config: isRecord(value.config) ? value.config : {},
    active_job: activeJob,
    sync_history: history,
    data_flows: asArray<unknown>(value.data_flows)
      .map(parseDataFlow)
      .filter((flow): flow is IntegrationDataFlow => flow !== null),
    coverage_totals: isRecord(value.coverage_totals) ? (value.coverage_totals as unknown as IntegrationCoverageTotals) : null,
    webhook_telemetry: isRecord(value.webhook_telemetry) ? (value.webhook_telemetry as unknown as IntegrationWebhookTelemetry) : null,
    aggregate_freshness: parseAggregateFreshness(value.aggregate_freshness),
  };
}

function normalizeCatalogItem(value: unknown): IntegrationCatalogItem | null {
  if (!isRecord(value)) return null;

  const rawType = isRecord(value.type) ? value.type : value;
  const rawIntegration = isRecord(value.integration) ? value.integration : value.tenant_integration;
  const recentJobs = asArray<unknown>(value.recent_jobs).map(parseSyncJob).filter((job): job is IntegrationSyncJob => job !== null);
  const latestJob = parseSyncJob(value.latest_job);
  const activeFlows = asArray<unknown>(value.active_flows).map(parseDataFlow).filter((flow): flow is IntegrationDataFlow => flow !== null);

  const tenantIntegration =
    rawIntegration && isRecord(rawIntegration)
      ? parseTenantIntegration({
          ...rawIntegration,
          active_job: latestJob && ACTIVE_STATUSES.includes(latestJob.status) ? latestJob : null,
          sync_history: recentJobs.length > 0 ? recentJobs : latestJob ? [latestJob] : [],
          data_flows: activeFlows,
        })
      : null;

  return {
    id: asString(rawType.id || value.id),
    display_name: asString(rawType.display_name || value.display_name || value.title),
    description: asString(rawType.description || value.description),
    family_flag: inferFamilyFlag(asString(rawType.id || value.id)),
    connectivity_mode: (asString(rawType.connectivity_mode || value.connectivity_mode) || 'cloud') as IntegrationConnectivityMode,
    auth_schema: isRecord(rawType.auth_schema) ? { oauth: rawType.auth_schema.oauth === true, fields: asArray<IntegrationAuthField>(rawType.auth_schema.fields) } : null,
    capabilities: isRecord(rawType.capabilities)
      ? {
          inbound_reference: asArray<string>(rawType.capabilities.inbound_reference),
          inbound_transactional: asArray<string>(rawType.capabilities.inbound_transactional),
          outbound_reference: asArray<string>(rawType.capabilities.outbound_reference),
          outbound_transactional: asArray<string>(rawType.capabilities.outbound_transactional),
          webhooks: rawType.capabilities.webhooks === true,
        }
      : null,
    logo_url: asNullableString(rawType.logo_url),
    tenant_integration: tenantIntegration,
    setup_notes: asArray<string>(value.setup_notes).filter((note) => typeof note === 'string'),
    coverage_totals: isRecord(value.coverage_totals) ? (value.coverage_totals as unknown as IntegrationCoverageTotals) : null,
    webhook_telemetry: isRecord(value.webhook_telemetry) ? (value.webhook_telemetry as unknown as IntegrationWebhookTelemetry) : null,
    aggregate_freshness: parseAggregateFreshness(value.aggregate_freshness),
  };
}

function parseSettingsView(payload: unknown): IntegrationsSettingsView {
  if (isRecord(payload) && Array.isArray(payload.integrations)) {
    return {
      integrations: payload.integrations.map(normalizeCatalogItem).filter((item): item is IntegrationCatalogItem => item !== null),
      last_updated_at: asNullableString(payload.last_updated_at),
    };
  }

  const root = isRecord(payload) ? payload : {};
  return {
    integrations: asArray<unknown>(root.catalog).map(normalizeCatalogItem).filter((item): item is IntegrationCatalogItem => item !== null),
    last_updated_at: asNullableString(root.last_updated_at),
  };
}

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok) {
    throw makeHttpError(json.error?.message ?? `Request failed (${res.status})`, res.status);
  }
  return json;
}

async function fetchSettings(): Promise<IntegrationsSettingsView> {
  const res = await apiFetch('/api/settings/integrations');
  const json = await parseEnvelope<unknown>(res);
  return parseSettingsView(json.data);
}

async function postTest(body: TestConnectionInput): Promise<IntegrationTestResult> {
  const res = await apiPost('/api/settings/integrations/test', body);
  const json = await parseEnvelope<{ ok?: boolean; meta?: Record<string, unknown> } | IntegrationTestResult>(res);
  const data = json.data;
  if (!data) throw new Error('Connection test failed');

  if ('connection_label' in data || 'sample_counts' in data) {
    return data as IntegrationTestResult;
  }

  const meta = isRecord((data as { meta?: unknown }).meta) ? (data as { meta?: Record<string, unknown> }).meta ?? {} : {};
  const counts = isRecord(meta.discovered_counts) ? meta.discovered_counts : {};
  return {
    ok: (data as { ok?: boolean }).ok === true,
    connection_label: asNullableString(meta.organization_name),
    message: (data as { ok?: boolean }).ok === true ? 'Credentials look healthy.' : 'Connection test failed.',
    metadata: meta,
    sample_counts: Object.fromEntries(
      Object.entries(counts).filter(([, count]) => typeof count === 'number' && Number.isFinite(count)),
    ) as Record<string, number>,
    warnings: null,
  };
}

async function postConnect(body: TestConnectionInput): Promise<IntegrationsSettingsView> {
  const res = await apiPost('/api/settings/integrations/connect', {
    integration_type_id: body.integration_type_id,
    credentials: body.credentials,
    config: body.config ?? {},
  });
  const json = await parseEnvelope<unknown>(res);
  return parseSettingsView(json.data);
}

async function postStartImport(body: StartImportInput): Promise<StartImportResult> {
  const res = await apiPost('/api/settings/integrations/sync', {
    tenant_integration_id: body.tenant_integration_id,
    import_orders_since: body.import_start_date,
    job_type: 'initial_reference',
    run_kind: 'initial_sync',
    mode: 'initial_import',
  });
  const json = await parseEnvelope<{ job_id?: string }>(res);
  if (!json.data) throw new Error('Import did not start');
  return {
    integration_type_id: body.integration_type_id,
    tenant_integration_id: body.tenant_integration_id,
    job_id: asNullableString(json.data.job_id),
  };
}

async function postDisconnect(body: { tenant_integration_id: string }): Promise<IntegrationsSettingsView> {
  const res = await apiPost('/api/settings/integrations/disconnect', body);
  const json = await parseEnvelope<unknown>(res);
  return parseSettingsView(json.data);
}

async function postRetryWebhookSetup(body: {
  tenant_integration_id: string;
}): Promise<{ status: 'active' | 'failed'; message: string }> {
  const res = await apiPost('/api/settings/integrations/zoho/webhooks/retry', body);
  const json = await parseEnvelope<{
    webhook_setup?: {
      status?: 'active' | 'failed';
      message?: string;
    };
  }>(res);

  const setup = json.data?.webhook_setup;
  return {
    status: setup?.status === 'active' ? 'active' : 'failed',
    message:
      setup?.message ??
      (setup?.status === 'active'
        ? 'Zoho webhooks are active.'
        : 'Zoho webhooks could not be registered right now.'),
  };
}

async function postSyncNow(body: SyncNowInput): Promise<StartImportResult> {
  const res = await apiPost('/api/settings/integrations/sync', {
    tenant_integration_id: body.tenant_integration_id,
    job_type: 'manual',
    run_kind: body.phase ? 'manual_phase' : 'manual_full',
    ...(body.phase ? { phase: body.phase } : {}),
    ...(body.since ? { since: body.since } : {}),
    ...(typeof body.max_pages === 'number' ? { max_pages: body.max_pages } : {}),
    force_full_refresh: body.force_full_refresh ?? false,
  });
  const json = await parseEnvelope<{ job_id?: string }>(res);
  if (!json.data) throw new Error('Sync did not start');
  return {
    integration_type_id: '',
    tenant_integration_id: body.tenant_integration_id,
    job_id: asNullableString(json.data.job_id),
  };
}

async function postStopSync(body: StopSyncInput): Promise<IntegrationsSettingsView> {
  const res = await apiPost('/api/settings/integrations/sync/cancel', {
    tenant_integration_id: body.tenant_integration_id,
  });
  const json = await parseEnvelope<unknown>(res);
  return parseSettingsView(json.data);
}

async function postRepairAggregates(body: RepairAggregatesInput): Promise<{ repair_job_id: string }> {
  const res = await apiPost('/api/settings/integrations/repair-aggregates', {
    tenant_integration_id: body.tenant_integration_id,
    ...(body.start_date ? { start_date: body.start_date } : {}),
    ...(body.end_date ? { end_date: body.end_date } : {}),
    ...(typeof body.include_snapshots === 'boolean' ? { include_snapshots: body.include_snapshots } : {}),
    ...(typeof body.include_kpis === 'boolean' ? { include_kpis: body.include_kpis } : {}),
  });
  const json = await parseEnvelope<{ repair_job_id: string }>(res);
  return json.data as { repair_job_id: string };
}

async function postRunAnalysis(body: RunAnalysisInput): Promise<IntegrationsSettingsView> {
  const res = await apiPost('/api/settings/integrations/run-analysis', {
    tenant_integration_id: body.tenant_integration_id,
    ...(typeof body.days === 'number' ? { days: body.days } : {}),
  });
  const json = await parseEnvelope<unknown>(res);
  return parseSettingsView(json.data);
}

function hasActiveJob(view?: IntegrationsSettingsView | null) {
  return (
    view?.integrations?.some((integration) => {
      const status = integration.tenant_integration?.active_job?.status;
      return status ? ACTIVE_STATUSES.includes(status) : false;
    }) ?? false
  );
}

function createOptimisticView(current: IntegrationsSettingsView | undefined, input: StartImportInput): IntegrationsSettingsView | undefined {
  if (!current) return current;
  const now = new Date().toISOString();
  const optimisticJob: IntegrationSyncJob = {
    id: `optimistic-${Math.random().toString(36).slice(2, 10)}`,
    job_type: 'initial_reference',
    status: 'queued',
    progress: {
      phase: 'queued',
      phase_label: `Queueing import from ${input.import_start_date}`,
      phases_total: 2,
      phase_current: 1,
      items_total: 0,
      items_processed: 0,
      items_failed: 0,
      cursor: null,
    },
    error_log: null,
    summary: null,
    started_at: null,
    completed_at: null,
    created_at: now,
  };

  return {
    ...current,
    integrations: current.integrations.map((integration) => {
      if (integration.id !== input.integration_type_id) return integration;
      const existing = integration.tenant_integration;
      return {
        ...integration,
        tenant_integration: {
          id: existing?.id ?? `optimistic-${integration.id}`,
          status: 'syncing' as TenantIntegrationStatus,
          health_status: existing?.health_status ?? 'ok',
          connected_at: existing?.connected_at ?? now,
          last_health_check_at: existing?.last_health_check_at ?? now,
          config: { ...(existing?.config ?? {}), import_start_date: input.import_start_date },
          active_job: optimisticJob,
          sync_history: [optimisticJob, ...(existing?.sync_history ?? [])],
          data_flows: existing?.data_flows ?? [],
        },
      };
    }),
  };
}

// syncNowMutation ("Sync Again" / "Sync now") had no optimistic update at
// all, unlike the initial-import mutation above. That meant clicking it left
// query.data's active_job untouched until the mutation's own HTTP call
// resolved — and integrations-sync runs the whole phase chain synchronously
// inside that one request, so it can stay pending for a long time. Two
// consequences: the card kept showing the previous (often failed) run's
// status, and the realtime subscription in useIntegrationsSettings — which
// only arms when at least one integration already has a non-null active_job
// — never turned on for this run, since query.data never reflected it. This
// sets an optimistic active_job immediately so both the display and the
// realtime subscription pick up the new run right away, matching the
// pattern already used for the initial-import mutation and stopSyncMutation.
function createSyncNowOptimisticView(current: IntegrationsSettingsView | undefined, input: SyncNowInput): IntegrationsSettingsView | undefined {
  if (!current) return current;
  const now = new Date().toISOString();
  // Same phase list the server will create moments later (job_type is always
  // 'manual' for this mutation — see postSyncNow) — lets the phase-grid render
  // every expected phase as "Not Started" immediately, before any slave job
  // rows exist, instead of showing stale state from a previous run.
  const expectedPhases = resolvePhasesForPolicy({
    requestedPhase: input.phase ?? null,
    enrichmentPolicy: resolveSyncEnrichmentPolicy('manual'),
  });
  const optimisticJob: IntegrationSyncJob = {
    id: `optimistic-${Math.random().toString(36).slice(2, 10)}`,
    phase: 'sync_run',
    job_type: 'manual',
    status: 'pending',
    progress: {
      phase: input.phase ?? 'sync_run',
      phase_label: input.phase ? `Queueing ${input.phase} sync…` : 'Queueing full sync…',
      phases_in_run: [...expectedPhases],
    },
    error_log: null,
    summary: null,
    started_at: null,
    completed_at: null,
    created_at: now,
  };

  return {
    ...current,
    integrations: current.integrations.map((integration) => {
      if (integration.tenant_integration?.id !== input.tenant_integration_id) return integration;
      const existing = integration.tenant_integration;
      return {
        ...integration,
        tenant_integration: {
          ...existing,
          status: 'syncing' as TenantIntegrationStatus,
          active_job: optimisticJob,
          sync_history: [optimisticJob, ...(existing.sync_history ?? [])],
        },
      };
    }),
  };
}

function createDisconnectOptimisticView(
  current: IntegrationsSettingsView | undefined,
  tenantIntegrationId: string,
): IntegrationsSettingsView | undefined {
  if (!current) return current;

  return {
    ...current,
    integrations: current.integrations.map((integration) => {
      if (integration.tenant_integration?.id !== tenantIntegrationId) return integration;
      return {
        ...integration,
        tenant_integration: null,
      };
    }),
  };
}

export function useIntegrationsSettings(initialData?: IntegrationSettingsPayload | null) {
  const { currentTenantId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['settings-integrations', currentTenantId] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(currentTenantId),
    queryFn: fetchSettings,
    initialData: initialData ? parseSettingsView(initialData) : undefined,
    retry: transientQueryRetry,
  });

  // Realtime: invalidate query whenever any active sync job updates
  const activeIntegrationIds = (query.data?.integrations ?? [])
    .map((i) => (i.tenant_integration?.active_job ? i.tenant_integration.id : null))
    .filter((id): id is string => Boolean(id));

  useEffect(() => {
    if (activeIntegrationIds.length === 0) return;

    const channels = activeIntegrationIds.map((tiId) =>
      supabase
        .channel(`sync-job-main-${tiId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'app', table: 'integration_sync_jobs', filter: `tenant_integration_id=eq.${tiId}` },
          () => { void queryClient.invalidateQueries({ queryKey }); },
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIntegrationIds.join(','), queryClient]);

  const testMutation = useMutation({
    mutationFn: postTest,
    onSuccess: (result) => {
      toast.success(result.connection_label ? `Connected to ${result.connection_label}` : 'Connection verified');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Connection test failed');
    },
  });

  const connectMutation = useMutation({
    mutationFn: postConnect,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success('Integration connected');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to connect integration');
    },
  });

  const syncMutation = useMutation({
    mutationFn: postStartImport,
    onMutate: async (input) => {
      const snapshots = await takeSnapshots(queryClient, [queryKey]);
      queryClient.setQueryData<IntegrationsSettingsView>(queryKey, (current) => createOptimisticView(current, input));
      return { snapshots };
    },
    onSuccess: () => {
      toast.success('Sync started');
    },
    onError: (error, _input, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to start import');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: postDisconnect,
    onMutate: async (input) => {
      const snapshots = await takeSnapshots(queryClient, [queryKey]);
      queryClient.setQueryData<IntegrationsSettingsView>(queryKey, (current) =>
        createDisconnectOptimisticView(current, input.tenant_integration_id),
      );
      return { snapshots };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success('Integration disconnected');
    },
    onError: (error, _input, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect integration');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const syncNowMutation = useMutation({
    mutationFn: postSyncNow,
    onMutate: async (input) => {
      const snapshots = await takeSnapshots(queryClient, [queryKey]);
      queryClient.setQueryData<IntegrationsSettingsView>(queryKey, (current) => createSyncNowOptimisticView(current, input));
      // Immediate feedback on click — don't wait on the network round-trip.
      toast.success('Sync started');
      return { snapshots };
    },
    onError: (error, _input, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to start sync');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const stopSyncMutation = useMutation({
    mutationFn: postStopSync,
    onMutate: async (input) => {
      const snapshots = await takeSnapshots(queryClient, [queryKey]);
      queryClient.setQueryData<IntegrationsSettingsView>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          integrations: current.integrations.map((integration) => {
            if (integration.tenant_integration?.id !== input.tenant_integration_id) return integration;
            return {
              ...integration,
              tenant_integration: integration.tenant_integration
                ? { ...integration.tenant_integration, active_job: null }
                : null,
            };
          }),
        };
      });
      return { snapshots };
    },
    onSuccess: () => {
      toast.success('Sync cancelled');
    },
    onError: (error, _input, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to stop sync');
    },
    onSettled: () => {
      // Delay refetch — phase jobs update asynchronously after cancel RPC; immediate
      // refetch may still see running status and overwrite the optimistic clear.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey }), 3000);
    },
  });

  const retryWebhookMutation = useMutation({
    mutationFn: postRetryWebhookSetup,
    onSuccess: (result) => {
      if (result.status === 'active') {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to retry webhook setup');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const repairAggregatesMutation = useMutation({
    mutationFn: postRepairAggregates,
    onSuccess: () => {
      toast.success('Repair queued — rebuilding aggregates in the background');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to queue repair job');
    },
  });

  const runAnalysisMutation = useMutation({
    mutationFn: postRunAnalysis,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success('Analysis started');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to run analysis');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    testConnection: testMutation.mutateAsync,
    connectIntegration: connectMutation.mutateAsync,
    startSync: syncMutation.mutateAsync,
    startImport: syncMutation.mutateAsync,
    disconnectIntegration: disconnectMutation.mutateAsync,
    syncNowIntegration: syncNowMutation.mutateAsync,
    stopSyncIntegration: stopSyncMutation.mutateAsync,
    retryWebhookSetup: retryWebhookMutation.mutateAsync,
    repairAggregates: repairAggregatesMutation.mutateAsync,
    runAnalysis: runAnalysisMutation.mutateAsync,
    isTestingConnection: testMutation.isPending,
    isConnecting: connectMutation.isPending,
    isStartingSync: syncMutation.isPending,
    isStartingImport: syncMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    isSyncingNow: syncNowMutation.isPending,
    isStoppingSync: stopSyncMutation.isPending,
    isRetryingWebhookSetup: retryWebhookMutation.isPending,
    isRepairingAggregates: repairAggregatesMutation.isPending,
    isRunningAnalysis: runAnalysisMutation.isPending,
    testResult: testMutation.data,
  };
}
