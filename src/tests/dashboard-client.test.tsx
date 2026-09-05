import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSellerLandingPeriodMock = vi.fn();
const useSellerDashboardMock = vi.fn();
const useSellerDashboardMetricsMock = vi.fn();
const useSellerDashboardBusinessFlowMock = vi.fn();
const useSellerDashboardCustomerActivityMock = vi.fn();
const useSellerDashboardSalesMixMock = vi.fn();
const useSellerDashboardLocationPerformanceMock = vi.fn();
const useRetainedValueMock = vi.fn();
const useRouterMock = vi.fn();

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: (...args: unknown[]) => useSellerLandingPeriodMock(...args),
}));

vi.mock('@/hooks/useSellerDashboard', () => ({
  useSellerDashboard: (...args: unknown[]) => useSellerDashboardMock(...args),
  useSellerDashboardMetrics: (...args: unknown[]) => useSellerDashboardMetricsMock(...args),
  useSellerDashboardBusinessFlow: (...args: unknown[]) => useSellerDashboardBusinessFlowMock(...args),
  useSellerDashboardCustomerActivity: (...args: unknown[]) => useSellerDashboardCustomerActivityMock(...args),
  useSellerDashboardSalesMix: (...args: unknown[]) => useSellerDashboardSalesMixMock(...args),
  useSellerDashboardLocationPerformance: (...args: unknown[]) => useSellerDashboardLocationPerformanceMock(...args),
}));

vi.mock('@/hooks/useRetainedValue', () => ({
  useRetainedValue: (...args: unknown[]) => useRetainedValueMock(...args),
}));

vi.mock('@/contexts/SellerRealtimeContext', () => ({
  useSellerRealtimeContext: () => ({
    newEntityIds: new Map<string, 'new'>(),
    markSeen: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {},
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

const tenantHolder = vi.hoisted(() => ({
  current: {
    id: 'tenant-1',
    slug: 'wineyard',
    business_name: 'WineYard',
    public_catalog_live: false as boolean,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    currentTenant: tenantHolder.current,
  }),
}));

import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import type { SellerDashboardResponse } from '@/types/seller-dashboard';

const periodHookValue = {
  period: 'week' as const,
  setPeriod: vi.fn(),
  horizonLabel: 'This Week',
  lowerLabel: 'this week',
  metricSuffix: 'WTD' as const,
  options: [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
  ],
};

const adminData: SellerDashboardResponse = {
  role: 'seller_admin',
  period: {
    selected: 'week',
    timezone: 'Asia/Kolkata',
    current_start: '2026-06-08T00:00:00.000Z',
    current_end_exclusive: '2026-06-15T00:00:00.000Z',
    previous_start: '2026-06-01T00:00:00.000Z',
    previous_end_exclusive: '2026-06-08T00:00:00.000Z',
    elapsed_days: 7,
  },
  tenant: {
    id: 'tenant-1',
    business_name: 'WineYard',
    subdomain: 'wineyard',
    plan: 'growth',
    location_names: ['Mumbai HQ'],
  },
  admin: {},
};

const assistantData: SellerDashboardResponse = {
  role: 'seller_assistant',
  period: adminData.period,
  tenant: {
    id: 'tenant-1',
    business_name: 'WineYard',
    subdomain: 'wineyard',
    plan: 'growth',
    location_names: ['Mumbai HQ', 'Pune Depot'],
  },
  assistant: {
    metrics: [
      { label: 'Open estimates', value: 5 },
      { label: 'Orders to confirm', value: 3, tone: 'warn' },
      { label: 'Overdue invoices', value: 1, tone: 'warn' },
    ],
    feeds: [
      { id: 'estimates', title: 'Estimates', href: '/estimates', empty_label: 'No estimates yet', rows: [] },
      { id: 'sales_orders', title: 'Sales Orders', href: '/sales-orders', empty_label: 'No orders yet', rows: [] },
      { id: 'invoices', title: 'Invoices', href: '/invoices', empty_label: 'No invoices yet', rows: [] },
    ],
  },
};

const businessFlowData = {
  primary_demand_kind: 'estimates' as const,
  months: [
    { period_start: '2026-01-01', invoice_value: 100000, invoice_count: 3, demand_value: 50000, demand_count: 2 },
    { period_start: '2026-02-01', invoice_value: 150000, invoice_count: 4, demand_value: 60000, demand_count: 3 },
    { period_start: '2026-03-01', invoice_value: 200000, invoice_count: 5, demand_value: 70000, demand_count: 3 },
    { period_start: '2026-04-01', invoice_value: 250000, invoice_count: 6, demand_value: 80000, demand_count: 4 },
    { period_start: '2026-05-01', invoice_value: 300000, invoice_count: 7, demand_value: 90000, demand_count: 4 },
    { period_start: '2026-06-01', invoice_value: 420000, invoice_count: 9, demand_value: 115000, demand_count: 4 },
  ],
};

const customerActivityData = { purchasing: 24, repeat: 11, inactive: 3, overdue: 2 };

const brandMixData = {
  items: [
    { id: 'brand-1', name: 'Alpha', current_value: 60000, prior_value: 50000 },
    { id: 'brand-2', name: 'Beta', current_value: 40000, prior_value: 35000 },
    { id: 'brand-6', name: 'Zeta', current_value: 20000, prior_value: 18000 },
  ],
};

const categoryMixData = {
  items: [
    { id: 'cat-1', name: 'CCTV', current_value: 70000, prior_value: 65000 },
    { id: 'cat-2', name: 'Access', current_value: 30000, prior_value: 28000 },
  ],
};

const locationPerformanceData = {
  locations: [
    { location_id: 'loc-1', name: 'Mumbai HQ', sales_value: 55000, overdue_amount: 5000, open_demand_value: 12000 },
    { location_id: 'loc-2', name: 'Pune Depot', sales_value: 45000, overdue_amount: 3000, open_demand_value: 9000 },
  ],
};

describe('SellerDashboardClient', () => {
  beforeEach(() => {
    tenantHolder.current.public_catalog_live = false;
    periodHookValue.setPeriod.mockReset();
    useSellerLandingPeriodMock.mockReturnValue(periodHookValue);
    useSellerDashboardMetricsMock.mockReset();
    useSellerDashboardMetricsMock.mockReturnValue({
      data: {
        page_key: 'dashboard',
        period: { period_key: 'this_week', grain: 'week', period_start: '', period_end_exclusive: '' },
        computed_at: null,
        source_watermark: null,
        cards: [
          { id: 'invoiced_sales', label: 'Invoiced sales', value: 420000, supporting_text: 'This week' },
          { id: 'open_orders', label: 'Orders to confirm', value: 4, supporting_text: 'Needs action' },
          { id: 'open_estimates', label: 'Open estimates', value: 2, supporting_text: 'Needs action' },
          { id: 'overdue_invoices', label: 'Overdue invoices', value: 1, supporting_text: 'Needs action' },
        ],
      },
    });
    useSellerDashboardBusinessFlowMock.mockReturnValue({ data: businessFlowData, isLoading: false });
    useSellerDashboardCustomerActivityMock.mockReturnValue({ data: customerActivityData, isLoading: false });
    useSellerDashboardSalesMixMock.mockImplementation((dimension: 'brands' | 'categories') => ({
      data: dimension === 'categories' ? categoryMixData : brandMixData,
      isLoading: false,
      isSuccess: true,
    }));
    useSellerDashboardLocationPerformanceMock.mockReturnValue({ data: locationPerformanceData, isLoading: false });
    useRetainedValueMock.mockImplementation((value: unknown) => value);
  });

  it('renders the admin dashboard variant with shared period options', async () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    expect(screen.getByText('Business flow')).toBeInTheDocument();
    expect(screen.getByText('Sales mix')).toBeInTheDocument();
    expect(screen.getByText('Customer activity')).toBeInTheDocument();
    expect(screen.getByText('Location performance')).toBeInTheDocument();
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
    expect(screen.getAllByText('₹4,20,000').length).toBeGreaterThan(0);

    expect(await screen.findByText('Zeta')).toBeInTheDocument();

    expect(screen.getByTestId('catalog-onboarding-intercept')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set it up/i })).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-live-share-card')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Brand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Category' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Location' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'See all' }).length).toBe(1);
  });

  it('renders the assistant dashboard variant without admin-only widgets', () => {
    useSellerDashboardMock.mockReturnValue({ data: assistantData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={assistantData} initialPeriod="week" />);

    expect(screen.queryByTestId('catalog-onboarding-intercept')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-live-share-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Business flow')).not.toBeInTheDocument();
    expect(screen.getByText('Estimates')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('switches the sales mix dimension and keeps the admin card grid in two columns', async () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    expect(await screen.findByText('CCTV')).toBeInTheDocument();

    const businessFlowSection = screen.getByText('Business flow').closest('section');
    expect(businessFlowSection?.parentElement?.className).toContain('xl:grid-cols-2');
  });

  it('opens the see all sheet for sales mix', () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'See all' })[0]!);
    const salesMixDialog = screen.getByRole('dialog');
    expect(within(salesMixDialog).getByText('Sales mix')).toBeInTheDocument();
    expect(within(salesMixDialog).getByText('Zeta')).toBeInTheDocument();
    fireEvent.click(within(salesMixDialog).getByRole('button', { name: 'Close' }));
  });

  it('shows the live share card after the public catalog is published', () => {
    tenantHolder.current.public_catalog_live = true;
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    expect(screen.getByTestId('catalog-live-share-card')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-onboarding-intercept')).not.toBeInTheDocument();
    expect(screen.getByText('wineyard.useyukti.in')).toBeInTheDocument();
  });

  it('does not render a Recent activity card in the admin section', () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'See all' }).length).toBe(1);
  });
});
