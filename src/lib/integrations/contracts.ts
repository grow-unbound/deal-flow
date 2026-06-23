export const INTEGRATION_TYPE_IDS = [
  'zoho_books',
  'zoho_inventory',
  'tally_prime',
  'busy',
] as const;

export type IntegrationTypeId = (typeof INTEGRATION_TYPE_IDS)[number];

export const ZOHO_INTEGRATION_TYPE_IDS = ['zoho_books', 'zoho_inventory'] as const;

export type ZohoIntegrationTypeId = (typeof ZOHO_INTEGRATION_TYPE_IDS)[number];

export const INTEGRATION_JOB_TYPES = [
  'initial_reference',
  'initial_transactional',
  'incremental',
  'manual',
] as const;

export type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];

export const INTEGRATION_SYNC_SCOPES = ['reference', 'transactional', 'full'] as const;

export type IntegrationSyncScope = (typeof INTEGRATION_SYNC_SCOPES)[number];

export interface ZohoCredentialsInput {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  organization_id?: string;
  org_id?: string;
  dc?: string;
  region?: string;
  accounts_base_url?: string;
  api_base_url?: string;
  [key: string]: unknown;
}

export interface IntegrationConnectRequest {
  tenant_id: string;
  integration_type_id: IntegrationTypeId;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
  tenant_integration_id?: string | null;
}

export interface IntegrationTestRequest {
  tenant_id: string;
  integration_type_id: IntegrationTypeId;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface IntegrationSyncPhaseStats {
  entity_type: string;
  processed: number;
  failed: number;
  pages: number;
}

export interface IntegrationProgressCursor {
  phase: string;
  entity_type: string;
  page: number;
  per_page: number;
  has_more: boolean;
  since: string | null;
}

export interface IntegrationJobProgress {
  version: 1;
  provider: 'zoho';
  scope: IntegrationSyncScope;
  since: string | null;
  phases: string[];
  phases_total: number;
  phase_current: number;
  phase: string | null;
  phase_label: string | null;
  items_processed: number;
  items_failed: number;
  items_total: number | null;
  pages_processed: number;
  cursor: IntegrationProgressCursor | null;
  counts: Record<string, IntegrationSyncPhaseStats>;
  started_at: string;
  updated_at: string;
  meta?: Record<string, unknown>;
  last_page?: {
    phase: string;
    count: number;
    next_page: number | null;
    completed_at: string;
    sample_ids?: string[];
  };
  note?: string;
}

export interface IntegrationJobSummary {
  provider: 'zoho';
  scope: IntegrationSyncScope;
  since: string | null;
  phases_completed: string[];
  counts: Record<string, IntegrationSyncPhaseStats>;
  last_synced_at: string;
  note?: string;
}

export interface IntegrationSyncRequest {
  tenant_integration_id: string;
  job_type?: IntegrationJobType;
  scope?: IntegrationSyncScope;
  since?: string | null;
  page_limit?: number | null;
  max_pages?: number | null;
}

export interface IntegrationWorkerDispatchRequest {
  job_id: string;
  tenant_integration_id?: string | null;
  continuation?: boolean;
  reason?: string | null;
  page_limit?: number | null;
  max_pages?: number | null;
  progress?: Partial<IntegrationJobProgress> | null;
  credentials?: Record<string, unknown> | null;
}

export interface IntegrationWebhookRequest {
  endpoint_token?: string | null;
  tenant_integration_id?: string | null;
  event_type?: string | null;
  payload?: unknown;
}
