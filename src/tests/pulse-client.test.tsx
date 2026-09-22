import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PulseDashboardClient } from '@/components/seller/pulse/PulseDashboardClient';
import type { PulseContributionResponse, PulseOpportunitiesResponse } from '@/types/pulse';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

function renderPulse() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PulseDashboardClient />
    </QueryClientProvider>,
  );
}

const contribution: PulseContributionResponse = {
  source: 'app.get_buyer_app_dashboard_v4',
  computed_at: '2026-09-22T04:00:00.000Z',
  source_watermark: '2026-09-22T03:45:00.000Z',
  freshness_label: new Date().toISOString(),
  primary_demand_kind: 'orders',
  cards: [
    {
      id: 'yukti_access_enabled',
      label: 'Customers with Yukti access',
      value: 27,
      value_kind: 'count',
      buyer_count: 27,
      time_basis: 'NOW',
      evidence: 'Customers who can submit demand through Yukti',
    },
    {
      id: 'demand_captured',
      label: 'Demand captured through Yukti',
      value: 840000,
      value_kind: 'currency',
      document_count: 9,
      buyer_count: 6,
      time_basis: 'QTD',
      evidence: '9 submitted demand documents from 6 buyers',
    },
  ],
};

const opportunities: PulseOpportunitiesResponse = {
  source: 'app.get_buyer_app_dashboard_v4',
  computed_at: '2026-09-22T04:00:00.000Z',
  source_watermark: '2026-09-22T03:45:00.000Z',
  freshness_label: new Date().toISOString(),
  groups: [
    {
      id: 'valuable_assisted_customers_without_access',
      title: 'Activate valuable customers',
      description: 'High-value customers still order manually and do not have Yukti access enabled.',
      count: 12,
      time_basis: 'NOW + QTD',
      evidence: '12 customers ranked by assisted business in NOW + QTD',
      action_label: 'Open access management',
      href: '/buyer-app/access?status=suggested',
      previews: [
        {
          buyer_id: 'buyer-1',
          name: 'Alpha Retail',
          initials: 'AR',
          evidence_value: 410000,
          evidence_label: 'assisted business',
          href: '/customers/buyer-1',
        },
      ],
    },
    {
      id: 'access_enabled_but_never_used',
      title: 'Convert interested customers',
      description: 'Customers have access enabled but still do business outside Yukti.',
      count: 7,
      time_basis: 'NOW',
      evidence: '7 access-enabled customers have no recorded Yukti use',
      action_label: 'Review enabled customers',
      href: '/buyer-app/access?status=inactive',
      previews: [
        {
          buyer_id: 'buyer-2',
          name: 'Enabled Retail',
          initials: 'ER',
          evidence_value: 320000,
          evidence_label: 'business outside Yukti',
          href: '/customers/buyer-2',
        },
      ],
    },
  ],
};

describe('PulseDashboardClient', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders the P01 Pulse core without retired ERP dashboard widgets', async () => {
    apiFetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes('opportunities') ? opportunities : contribution,
    }));

    renderPulse();

    expect(screen.getByRole('heading', { name: 'Pulse' })).toBeInTheDocument();
    expect(await screen.findByText('Customers with Yukti access · NOW')).toBeInTheDocument();
    expect(await screen.findByText(/Demand captured through Yukti/)).toBeInTheDocument();
    expect(await screen.findByText('Activate valuable customers')).toBeInTheDocument();
    expect(await screen.findByText('Convert interested customers')).toBeInTheDocument();
    expect(await screen.findByText('business outside Yukti')).toBeInTheDocument();

    expect(screen.queryByText('Business flow')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Sales mix')).not.toBeInTheDocument();
    expect(screen.queryByText('Location performance')).not.toBeInTheDocument();
    expect(screen.queryByText(/Buyer channels/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-live-share-card')).not.toBeInTheDocument();
  });

  it('keeps opportunities visible when contribution fails', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes('contribution')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'fail' }) });
      }
      return Promise.resolve({ ok: true, json: async () => opportunities });
    });

    renderPulse();

    expect(await screen.findByText('Contribution could not load')).toBeInTheDocument();
    expect(await screen.findByText('Activate valuable customers')).toBeInTheDocument();
  });

  it('uses independent navigation-tier query keys and preserves successful content through sibling failure', async () => {
    apiFetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes('opportunities') ? opportunities : { ...contribution, cards: [] },
    }));

    renderPulse();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/tenant/pulse/contribution');
      expect(apiFetchMock).toHaveBeenCalledWith('/api/tenant/pulse/opportunities');
    });
    expect(await screen.findByText('Pulse will focus once Yukti captures demand')).toBeInTheDocument();
    expect(await screen.findByText('Activate valuable customers')).toBeInTheDocument();
  });
});
