import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const headersMock = vi.fn();
const getFlagMock = vi.fn();
const useFlagStateMock = vi.fn();
const apiFetchMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const redirectMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  FLAGS: {
    INTEGRATIONS: 'df_integrations',
  },
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (flag: string) => useFlagStateMock(flag),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
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
    useFlagStateMock.mockImplementation((flag: string) => {
      if (flag === 'TALLY_INTEGRATION' || flag === 'BUSY_INTEGRATION') return false;
      return true;
    });
    useAuthMock.mockReturnValue({
      currentTenantId: 'tenant-1',
      tenantProfile: { role: 'seller_admin' },
    });
    apiFetchMock.mockResolvedValue(jsonResponse(buildIntegrationsPayload()));
    apiPostMock.mockResolvedValue(jsonResponse({ ok: true }));
  });

  it('renders feature-off state when umbrella integrations flag is disabled', async () => {
    getFlagMock.mockResolvedValue(false);

    render(await SettingsIntegrationsPage());

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
  });

  it('renders integrations settings when umbrella flag is enabled', async () => {
    renderWithQueryClient(await SettingsIntegrationsPage());

    expect(screen.getByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Zoho Books' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Single-page setup/i)).toBeInTheDocument();
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

  it('renders coming-soon cards when a family flag is off', async () => {
    renderWithQueryClient(<IntegrationsSettingsClient />);

    expect(await screen.findByText('Tally Prime')).toBeInTheDocument();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Connect Tally Prime' })).toBeDisabled();
  });

  it('tests connection and starts import from the wizard', async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(buildIntegrationsPayload()))
      .mockResolvedValueOnce(jsonResponse(buildIntegrationsPayload({ activeJobStatus: 'running' })));

    apiPostMock
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          connection_label: 'WineYard HQ',
          message: 'Credentials look healthy.',
          sample_counts: {
            products: 1240,
            customers: 89,
            orders: 318,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job_id: 'job-1',
        }),
      );

    renderWithQueryClient(<IntegrationsSettingsClient />);

    expect(await screen.findByRole('button', { name: 'Connect Zoho Books' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Zoho Books' }));
    expect(screen.getByRole('heading', { name: 'Zoho Books setup' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'client-1' } });
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'secret-1' } });
    fireEvent.change(screen.getByLabelText('Refresh Token'), { target: { value: 'refresh-1' } });
    fireEvent.change(screen.getByLabelText('Organization ID'), { target: { value: 'org-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/settings/integrations/test',
        expect.objectContaining({
          integration_type_id: 'zoho_books',
          credentials: expect.objectContaining({
            client_id: 'client-1',
            client_secret: 'secret-1',
            refresh_token: 'refresh-1',
            org_id: 'org-123',
          }),
        }),
      );
    });

    expect(await screen.findByText('WineYard HQ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/settings/integrations/sync',
        expect.objectContaining({
          integration_type_id: 'zoho_books',
          import_orders_since: expect.any(String),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Importing products...')).toBeInTheDocument();
    });
    expect(screen.getByText(/Polling every 3 seconds while active/i)).toBeInTheDocument();
  }, 10000);

  it('polls running syncs into completed history', async () => {
    vi.useFakeTimers();

    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(buildIntegrationsPayload({ activeJobStatus: 'running' })))
      .mockResolvedValueOnce(jsonResponse(buildIntegrationsPayload({ activeJobStatus: 'completed', includeSummary: true })));

    renderWithQueryClient(<IntegrationsSettingsClient />);

    await waitFor(() => {
      expect(screen.getByText('Importing products...')).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Latest import summary')).toBeInTheDocument();
    });
    expect(screen.getByText('1240')).toBeInTheDocument();
    expect(screen.getByText(/History updates after every completed run/i)).toBeInTheDocument();

    vi.useRealTimers();
  }, 10000);
});
