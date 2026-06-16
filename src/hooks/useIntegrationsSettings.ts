'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { makeHttpError, transientQueryRetry } from '@/lib/query-retry';

export type IntegrationFamilyFlag = 'ZOHO_INTEGRATION' | 'TALLY_INTEGRATION' | 'BUSY_INTEGRATION';
export type IntegrationConnectivityMode = 'cloud' | 'local';
export type TenantIntegrationStatus = 'pending_setup' | 'connected' | 'syncing' | 'sync_failed' | 'disconnected';
export type IntegrationHealthStatus = 'ok' | 'expired' | 'invalid' | null;
export type IntegrationSyncJobType = 'initial_reference' | 'initial_transactional' | 'incremental' | 'manual';
export type IntegrationSyncJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type IntegrationTriggerType = 'webhook' | 'scheduled' | 'event';
export type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';

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
  phase?: string | null;
  phase_label?: string | null;
  phases_total?: number | null;
  phase_current?: number | null;
  items_total?: number | null;
  items_processed?: number | null;
  items_failed?: number | null;
  cursor?: string | null;
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
  status: IntegrationSyncJobStatus;
  progress?: IntegrationSyncProgress | null;
  error_log?: IntegrationSyncError[] | null;
  summary?: Record<string, number> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface IntegrationDataFlow {
  id: string;
  entity_type: string;
  direction: IntegrationDirection;
  trigger_type: IntegrationTriggerType;
  schedule?: string | null;
  is_active: boolean;
  last_run_at?: string | null;
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

interface ApiEnvelope<T> {
  data: T | null;
  error?: { code?: string; message?: string } | null;
}

const ACTIVE_STATUSES: IntegrationSyncJobStatus[] = ['queued', 'running'];

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

function inferFamilyFlag(id: string): IntegrationFamilyFlag {
  if (id.startsWith('zoho_')) return 'ZOHO_INTEGRATION';
  if (id === 'tally_prime') return 'TALLY_INTEGRATION';
  return 'BUSY_INTEGRATION';
}

function parseSyncJob(value: unknown): IntegrationSyncJob | null {
  if (!isRecord(value)) return null;

  return {
    id: asString(value.id),
    job_type: (asString(value.job_type) || 'manual') as IntegrationSyncJobType,
    status: (asString(value.status) || 'queued') as IntegrationSyncJobStatus,
    progress: isRecord(value.progress)
      ? {
          phase: asNullableString(value.progress.phase),
          phase_label: asNullableString(value.progress.phase_label),
          phases_total: asNumber(value.progress.phases_total),
          phase_current: asNumber(value.progress.phase_current),
          items_total: asNumber(value.progress.items_total),
          items_processed: asNumber(value.progress.items_processed),
          items_failed: asNumber(value.progress.items_failed),
          cursor: asNullableString(value.progress.cursor),
        }
      : null,
    error_log: asArray<unknown>(value.error_log)
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
    summary: isRecord(value.summary)
      ? Object.fromEntries(
          Object.entries(value.summary).filter(([, count]) => typeof count === 'number' && Number.isFinite(count)),
        ) as Record<string, number>
      : null,
    started_at: asNullableString(value.started_at),
    completed_at: asNullableString(value.completed_at),
    created_at: asString(value.created_at, new Date(0).toISOString()),
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
    is_active: value.is_active !== false,
    last_run_at: asNullableString(value.last_run_at),
  };
}

function parseTenantIntegration(value: unknown): TenantIntegrationDetail | null {
  if (!isRecord(value)) return null;

  const history = asArray<unknown>(value.sync_history)
    .map(parseSyncJob)
    .filter((job): job is IntegrationSyncJob => job !== null);

  const activeJob = parseSyncJob(value.active_job);

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

function hasActiveJob(view?: IntegrationsSettingsView | null) {
  return (
    view?.integrations.some((integration) => {
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

export function useIntegrationsSettings() {
  const { currentTenantId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['settings-integrations', currentTenantId] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(currentTenantId),
    queryFn: fetchSettings,
    retry: transientQueryRetry,
    refetchInterval: (queryInfo) => (hasActiveJob(queryInfo.state.data as IntegrationsSettingsView | undefined) ? 3000 : false),
  });

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
      toast.success('Import started');
    },
    onError: (error, _input, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to start import');
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
    isTestingConnection: testMutation.isPending,
    isConnecting: connectMutation.isPending,
    isStartingSync: syncMutation.isPending,
    isStartingImport: syncMutation.isPending,
    testResult: testMutation.data,
  };
}
