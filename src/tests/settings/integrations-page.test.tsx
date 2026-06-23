import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const headersMock = vi.fn();
const getFlagMock = vi.fn();
const loadIntegrationsSettingsPayloadMock = vi.fn();
const useFlagStateMock = vi.fn();
const apiFetchMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const redirectMock = vi.fn();
const routerReplaceMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
  useRouter: () => ({
    replace: (...args: unknown[]) => routerReplaceMock(...args),
    push: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/flags', () => ({
  FLAGS: {
    INTEGRATIONS: 'df_integrations',
  },
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/integrations/server', () => ({
  loadIntegrationsSettingsPayload: (...args: unknown[]) => loadIntegrationsSettingsPayloadMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (flag: string) => useFlagStateMock(flag),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/lib/server/seller-server-claims', () => ({
  requireSellerServerTenantId: async () => 'tenant-1',
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import SettingsIntegrationsPage from '../../../app/(seller)/settings/integrations/page';
import { IntegrationsSettingsClient } from '@/components/seller/settings/IntegrationsSettingsClient';
import { ConnectedIntegrationCard } from '@/components/seller/settings/ConnectedIntegrationCard';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function buildIntegrationsPayload(overrides?: {
  activeJobStatus?: 'queued' | 'running' | 'completed';
  includeSummary?: boolean;
}) {
  const runningJob =
    overrides?.activeJobStatus && overrides.activeJobStatus !== 'completed'
      ? {
          id: 'job-1',
          job_type: 'initial_reference',
          status: overrides.activeJobStatus,
          progress: {
            phase: 'products',
            phase_label: 'Importing products...',
            phases_total: 2,
            phase_current: 2,
            items_total: 1240,
            items_processed: overrides.activeJobStatus === 'queued' ? 0 : 812,
            items_failed: 2,
          },
          error_log: [],
          summary: null,
          started_at: '2026-06-12T09:00:00.000Z',
          completed_at: null,
          created_at: '2026-06-12T08:59:00.000Z',
        }
      : null;

  const completedHistory = {
    id: 'job-1',
    job_type: 'initial_reference',
    status: 'completed',
    progress: {
      phase: 'completed',
      phase_label: 'Imported reference and transactional data.',
      phases_total: 2,
      phase_current: 2,
      items_total: 1240,
      items_processed: 1240,
      items_failed: 2,
    },
    error_log: [],
    summary: overrides?.includeSummary
      ? {
          brands: 42,
          products: 1240,
          customers: 89,
          orders: 318,
        }
      : null,
    started_at: '2026-06-12T09:00:00.000Z',
    completed_at: '2026-06-12T09:07:00.000Z',
    created_at: '2026-06-12T08:59:00.000Z',
  };

  return {
    integrations: [
      {
        id: 'zoho_books',
        display_name: 'Zoho Books',
        description: 'Sync orders and invoices with Zoho Books.',
        family_flag: 'ZOHO_INTEGRATION',
        connectivity_mode: 'cloud',
        auth_schema: {
          fields: [
            { key: 'client_id', label: 'Client ID', type: 'text', required: true },
            { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
            { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
            { key: 'org_id', label: 'Organization ID', type: 'text', required: true },
          ],
        },
        capabilities: {
          inbound_reference: ['brands', 'products', 'customers'],
          inbound_transactional: ['orders', 'invoices', 'estimates'],
        },
        tenant_integration:
          overrides?.activeJobStatus || overrides?.includeSummary
            ? {
                id: 'tenant-int-1',
                status: overrides?.activeJobStatus === 'completed' || overrides?.includeSummary ? 'connected' : 'syncing',
                health_status: 'ok',
                connected_at: '2026-06-10T11:00:00.000Z',
                last_health_check_at: '2026-06-12T08:50:00.000Z',
                config: { org_id: 'org-123' },
                active_job: runningJob,
                sync_history: [overrides?.activeJobStatus === 'completed' || overrides?.includeSummary ? completedHistory : runningJob].filter(Boolean),
                data_flows: [
                  {
                    id: 'flow-1',
                    entity_type: 'orders',
                    direction: 'outbound',
                    trigger_type: 'event',
                    schedule: null,
                    is_active: true,
                    last_run_at: '2026-06-12T09:10:00.000Z',
                  },
                ],
              }
            : null,
      },
      {
        id: 'zoho_inventory',
        display_name: 'Zoho Inventory',
        description: 'Keep products and stock movement aligned with Zoho Inventory.',
        family_flag: 'ZOHO_INTEGRATION',
        connectivity_mode: 'cloud',
        auth_schema: {
          fields: [],
        },
        capabilities: {
          inbound_reference: ['products'],
          inbound_transactional: [],
        },
        tenant_integration: null,
      },
      {
        id: 'tally_prime',
        display_name: 'Tally Prime',
        description: 'Bridge-based local integration for Tally Prime.',
        family_flag: 'TALLY_INTEGRATION',
        connectivity_mode: 'local',
        auth_schema: {
          fields: [],
        },
        capabilities: {
          inbound_reference: ['products'],
          inbound_transactional: ['orders'],
        },
        tenant_integration: null,
      },
      {
        id: 'busy',
        display_name: 'Busy Accounting',
        description: 'Reserve the Busy integration slot while rollout stays gated.',
        family_flag: 'BUSY_INTEGRATION',
        connectivity_mode: 'local',
        auth_schema: {
          fields: [],
        },
        capabilities: {
          inbound_reference: ['products'],
          inbound_transactional: ['orders'],
        },
        tenant_integration: null,
      },
    ],
    last_updated_at: '2026-06-12T09:11:00.000Z',
  };
}

describe('settings integrations page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers([['x-verified-tenant-id', 'tenant-1']]));
    getFlagMock.mockResolvedValue(true);
    loadIntegrationsSettingsPayloadMock.mockResolvedValue({ catalog: [] });
    useFlagStateMock.mockImplementation((flag: string) => {
      if (flag === 'TALLY_INTEGRATION' || flag === 'BUSY_INTEGRATION') return false;
      return true;
    });
    useAuthMock.mockReturnValue({
      currentTenantId: 'tenant-1',
      tenantProfile: { role: 'seller_admin' },
    });
    apiFetchMock.mockImplementation(async () => jsonResponse(buildIntegrationsPayload()));
    apiPostMock.mockImplementation(async () => jsonResponse({ ok: true }));
  });

  it('renders feature-off state when umbrella integrations flag is disabled', async () => {
    getFlagMock.mockResolvedValue(false);

    render(await SettingsIntegrationsPage());

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
  });

  it('renders integrations settings when umbrella flag is enabled', async () => {
    renderWithQueryClient(await SettingsIntegrationsPage());

    expect(screen.getByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    expect(await screen.findByText('No integrations connected yet')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add integration' })).toBeInTheDocument();
  });
});

describe('integrations settings client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFlagStateMock.mockImplementation((flag: string) => {
      if (flag === 'TALLY_INTEGRATION' || flag === 'BUSY_INTEGRATION') return false;
      return true;
    });
    useAuthMock.mockReturnValue({
      currentTenantId: 'tenant-1',
      tenantProfile: { role: 'seller_admin' },
    });
    apiFetchMock.mockResolvedValue(jsonResponse(buildIntegrationsPayload()));
  });

  it('opens the picker with only available Zoho integrations', async () => {
    renderWithQueryClient(<IntegrationsSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add integration' }));

    expect(await screen.findByRole('heading', { name: 'Add integration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zoho Books/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zoho Inventory/ })).toBeInTheDocument();
    expect(screen.queryByText('Tally Prime')).not.toBeInTheDocument();
    expect(screen.queryByText('Busy Accounting')).not.toBeInTheDocument();
  });

  it('starts sync now without sending the legacy scope field', async () => {
    apiFetchMock.mockImplementation(async () => jsonResponse(buildIntegrationsPayload({ includeSummary: true })));

    renderWithQueryClient(<IntegrationsSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/settings/integrations/sync', {
        tenant_integration_id: 'tenant-int-1',
        job_type: 'manual',
      });
    });
  });

  it('starts a phase-scoped sync for a single entity', async () => {
    apiFetchMock.mockImplementation(async () => jsonResponse(buildIntegrationsPayload({ includeSummary: true })));

    renderWithQueryClient(<IntegrationsSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now for Customers' }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/settings/integrations/sync', {
        tenant_integration_id: 'tenant-int-1',
        job_type: 'manual',
        phase: 'customers',
      });
    });
  });

  it('shows both reconnect and disconnect actions when an integration needs attention', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands'],
            inbound_transactional: ['orders'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'sync_failed',
            health_status: 'invalid',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: null,
            sync_history: [],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sync Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('shows stop sync when a job is actively running', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands'],
            inbound_transactional: ['orders'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'syncing',
            health_status: 'ok',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: {
              id: 'job-1',
              job_type: 'manual',
              status: 'running',
              progress: {
                phase: 'customers',
                phase_label: 'Importing customers...',
                phases_total: 4,
                phase_current: 2,
                items_total: 0,
                items_processed: 120,
                items_failed: 0,
                pages_processed: 2,
                counts: {
                  brands: { entity_type: 'brands', processed: 12, failed: 0, pages: 1 },
                  customers: { entity_type: 'customers', processed: 120, failed: 0, pages: 2 },
                },
              },
              error_log: [],
              summary: null,
              started_at: '2026-06-12T09:00:00.000Z',
              completed_at: null,
              created_at: '2026-06-12T08:59:00.000Z',
            },
            sync_history: [],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Stop sync' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('marks cancelled runs clearly in history', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands'],
            inbound_transactional: ['orders'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'connected',
            health_status: 'ok',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: null,
            sync_history: [
              {
                id: 'job-1',
                job_type: 'manual',
                status: 'cancelled',
                progress: {
                  phase: 'cancelled',
                  phase_label: 'Sync cancelled',
                  phases_total: 4,
                  phase_current: 2,
                  items_total: 0,
                  items_processed: 120,
                  items_failed: 0,
                  pages_processed: 2,
                },
                error_log: [],
                summary: null,
                started_at: '2026-06-12T09:00:00.000Z',
                completed_at: '2026-06-12T09:03:00.000Z',
                created_at: '2026-06-12T08:59:00.000Z',
              },
            ],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
      />,
    );

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Cancelled by user request. The worker stopped before the next fetch page.')).toBeInTheDocument();
  });

  it('shows phase-scoped sync controls for Zoho integrations', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands', 'products', 'customers'],
            inbound_transactional: ['estimates', 'orders', 'invoices'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'connected',
            health_status: 'ok',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: null,
            sync_history: [],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
        syncTargetPhase={null}
      />,
    );

    expect(screen.getByText('Run a single phase')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders')).toBeInTheDocument();
  });

  it('only marks the selected phase as syncing while a phase sync is pending', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands', 'products', 'customers'],
            inbound_transactional: ['estimates', 'orders', 'invoices'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'syncing',
            health_status: 'ok',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: {
              id: 'job-2',
              job_type: 'manual',
              status: 'running',
              progress: {
                phase: 'customers',
                phase_label: 'Importing customers...',
                phases_total: 1,
                phase_current: 1,
                items_total: 0,
                items_processed: 0,
                items_failed: 0,
                pages_processed: 0,
                counts: {
                  customers: { entity_type: 'customers', processed: 0, failed: 0, pages: 0 },
                },
              },
              error_log: [],
              summary: null,
              started_at: '2026-06-12T09:00:00.000Z',
              completed_at: null,
              created_at: '2026-06-12T08:59:00.000Z',
            },
            sync_history: [],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
        isSyncingNow
        syncTargetPhase="customers"
      />,
    );

    expect(screen.getByText('Syncing…')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now for Products' })).toBeDisabled();
  });

  it('surfaces the latest sync failure reason', () => {
    render(
      <ConnectedIntegrationCard
        integration={{
          id: 'zoho_books',
          display_name: 'Zoho Books',
          description: 'Sync orders and invoices with Zoho Books.',
          family_flag: 'ZOHO_INTEGRATION',
          connectivity_mode: 'cloud',
          auth_schema: { fields: [] },
          capabilities: {
            inbound_reference: ['brands'],
            inbound_transactional: ['orders'],
          },
          tenant_integration: {
            id: 'tenant-int-1',
            status: 'connected',
            health_status: 'ok',
            connected_at: '2026-06-10T11:00:00.000Z',
            last_health_check_at: '2026-06-12T08:50:00.000Z',
            config: { org_id: 'org-123' },
            active_job: null,
            sync_history: [
              {
                id: 'job-1',
                job_type: 'initial_reference',
                status: 'failed',
                progress: {
                  phase: 'products',
                  phase_label: 'Importing products...',
                  phases_total: 2,
                  phase_current: 1,
                  items_total: 1240,
                  items_processed: 812,
                  items_failed: 1,
                },
                error_log: [
                  {
                    timestamp: '2026-06-12T09:07:00.000Z',
                    message: 'Unable to retrieve integration secret.',
                  },
                ],
                summary: null,
                started_at: '2026-06-12T09:00:00.000Z',
                completed_at: '2026-06-12T09:07:00.000Z',
                created_at: '2026-06-12T08:59:00.000Z',
              },
            ],
            data_flows: [],
          },
        }}
        available
        isSellerAdmin
        onOpenWizard={vi.fn()}
        onDisconnect={vi.fn()}
        onSyncNow={vi.fn()}
        onSyncPhase={vi.fn()}
        onStopSync={vi.fn()}
        onRefresh={vi.fn()}
        onRetryWebhooks={vi.fn()}
      />,
    );

    expect(screen.getByText('Last sync failed')).toBeInTheDocument();
    expect(screen.getByText('Unable to retrieve integration secret.')).toBeInTheDocument();
  });
});
