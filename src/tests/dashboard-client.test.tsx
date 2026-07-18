import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSellerLandingPeriodMock = vi.fn();
const useSellerDashboardMock = vi.fn();
const useRetainedValueMock = vi.fn();
const useRouterMock = vi.fn();

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: (...args: unknown[]) => useSellerLandingPeriodMock(...args),
}));

vi.mock('@/hooks/useSellerDashboard', () => ({
  useSellerDashboard: (...args: unknown[]) => useSellerDashboardMock(...args),
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
  portfolio: {
    as_of: '2026-06-15T00:00:00.000Z',
    commercial_horizon_days: 90,
    table_period: null,
    primary_demand_kind: 'orders',
    calculation_version: 1,
    source_watermark: '2026-06-15T00:00:00.000Z',
    freshness: {},
    availability: {},
    metrics: [],
    actions: [],
    explore: [
      {
        id: 'business_flow',
        label: 'Business flow',
        time_basis: 'THIS MONTH',
        feasibility: 'REWORK',
        available: true,
        meta: {
          invoice_value_this_month: 420000,
          invoice_count_this_month: 9,
          order_value_this_month: 275000,
          order_count_this_month: 6,
          estimate_value_this_month: 115000,
          estimate_count_this_month: 4,
          orders_enabled: true,
          estimates_enabled: true,
        },
      },
      {
        id: 'sales_mix',
        label: 'Sales mix',
        time_basis: '90D',
        feasibility: 'REWORK',
        available: true,
        meta: {
          brands: [
            { id: 'brand-1', name: 'Alpha', value: 60000 },
            { id: 'brand-2', name: 'Beta', value: 40000 },
            { id: 'brand-3', name: 'Gamma', value: 35000 },
            { id: 'brand-4', name: 'Delta', value: 30000 },
            { id: 'brand-5', name: 'Epsilon', value: 25000 },
            { id: 'brand-6', name: 'Zeta', value: 20000 },
          ],
          categories: [
            { id: 'cat-1', name: 'CCTV', value: 70000 },
            { id: 'cat-2', name: 'Access', value: 30000 },
          ],
          locations: [
            { location_id: 'loc-1', name: 'Mumbai HQ', invoiced_sales_90d: 55000, open_primary_demand_value: 12000, overdue_amount: 5000 },
            { location_id: 'loc-2', name: 'Pune Depot', invoiced_sales_90d: 45000, open_primary_demand_value: 9000, overdue_amount: 3000 },
            { location_id: 'loc-3', name: 'Nagpur Hub', invoiced_sales_90d: 25000, open_primary_demand_value: 6000, overdue_amount: 1000 },
            { location_id: 'loc-4', name: 'Nashik Hub', invoiced_sales_90d: 15000, open_primary_demand_value: 4000, overdue_amount: 500 },
            { location_id: 'loc-5', name: 'Goa Hub', invoiced_sales_90d: 10000, open_primary_demand_value: 2000, overdue_amount: 0 },
            { location_id: 'loc-6', name: 'Aurangabad Hub', invoiced_sales_90d: 7000, open_primary_demand_value: 1000, overdue_amount: 250 },
          ],
        },
      },
      {
        id: 'customer_activity',
        label: 'Customer activity',
        time_basis: '90D',
        feasibility: 'REWORK',
        available: true,
        meta: {
          purchasing_customers_90d: 24,
          repeat_customers_90d: 11,
          inactive_customers_90d: 3,
          overdue_customers_now: 2,
        },
      },
      {
        id: 'location_comparison',
        label: 'Location comparison',
        time_basis: '90D',
        feasibility: 'REWORK',
        available: true,
        meta: {
          locations: [
            { location_id: 'loc-1', name: 'Mumbai HQ', invoiced_sales_90d: 55000, open_primary_demand_value: 12000, overdue_amount: 5000 },
            { location_id: 'loc-2', name: 'Pune Depot', invoiced_sales_90d: 45000, open_primary_demand_value: 9000, overdue_amount: 3000 },
            { location_id: 'loc-3', name: 'Nagpur Hub', invoiced_sales_90d: 25000, open_primary_demand_value: 6000, overdue_amount: 1000 },
            { location_id: 'loc-4', name: 'Nashik Hub', invoiced_sales_90d: 15000, open_primary_demand_value: 4000, overdue_amount: 500 },
            { location_id: 'loc-5', name: 'Goa Hub', invoiced_sales_90d: 10000, open_primary_demand_value: 2000, overdue_amount: 0 },
            { location_id: 'loc-6', name: 'Aurangabad Hub', invoiced_sales_90d: 7000, open_primary_demand_value: 1000, overdue_amount: 250 },
          ],
        },
      },
    ],
  },
  admin: {
    metrics: [
      { label: 'Orders · This Week', value: 12 },
      { label: 'GMV · This Week', value: 420000, tone: 'accent' },
      { label: 'Active catalogs', value: 3 },
      { label: 'Low-stock alerts', value: 2, tone: 'warn' },
    ],
    callouts: [
      { id: 'order_execution', kind: 'info', eyebrow: 'Order execution', hint: '12', rows: [] },
      { id: 'collections', kind: 'risk', eyebrow: 'Collections', hint: '2 overdue', rows: [] },
      { id: 'buyer_app_activation', kind: 'opportunity', eyebrow: 'Buyer App activation', hint: '1', rows: [] },
    ],
    recent_activity: [
      {
        id: 'order-1',
        kind: 'order',
        href: '/sales-orders/1',
        document_number: 'SO-001',
        customer_name: 'Acme',
        status: { label: 'Confirmed', tone: 'warning' },
        amount: 10000,
        updated_at: '2026-06-14T10:00:00.000Z',
      },
    ],
  },
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
    callouts: [
      { id: 'needs_action', kind: 'risk', eyebrow: 'Needs action', hint: '1 overdue', rows: [] },
      { id: 'recent_activity', kind: 'info', eyebrow: 'Recent activity', hint: 'Since your last sign-in', rows: [] },
      { id: 're_engage', kind: 'opportunity', eyebrow: 'Re-engage', hint: 'Dormant for 30+ days', rows: [] },
    ],
    feeds: [
      { id: 'estimates', title: 'Estimates', href: '/estimates', empty_label: 'No estimates yet', rows: [] },
      { id: 'sales_orders', title: 'Sales Orders', href: '/sales-orders', empty_label: 'No orders yet', rows: [] },
      { id: 'invoices', title: 'Invoices', href: '/invoices', empty_label: 'No invoices yet', rows: [] },
    ],
  },
};

describe('SellerDashboardClient', () => {
  beforeEach(() => {
    periodHookValue.setPeriod.mockReset();
    useSellerLandingPeriodMock.mockReturnValue(periodHookValue);
    useRetainedValueMock.mockImplementation((value: unknown) => value);
  });

  it('renders the admin dashboard variant with shared period options', async () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    expect(screen.getByText('Business flow')).toBeInTheDocument();
    expect(screen.getByText('Sales mix')).toBeInTheDocument();
    expect(screen.getByText('Customer activity')).toBeInTheDocument();
    expect(screen.getByText('Location comparison')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getAllByText('₹4.2L')).toHaveLength(2);
    expect(screen.getAllByText('₹10K').length).toBeGreaterThan(0);

    const businessFlowSection = screen.getByText('Business flow').closest('section');
    expect(businessFlowSection).not.toBeNull();
    expect(within(businessFlowSection as HTMLElement).getByText('Order value')).toBeInTheDocument();
    expect(within(businessFlowSection as HTMLElement).getByText('Estimate value')).toBeInTheDocument();
    expect(screen.getByText('Zeta')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Brand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'See all' }).length).toBeGreaterThanOrEqual(3);
  });

  it('renders the assistant dashboard variant without admin-only widgets', () => {
    useSellerDashboardMock.mockReturnValue({ data: assistantData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={assistantData} initialPeriod="week" />);

    expect(screen.queryByText('Business flow')).not.toBeInTheDocument();
    expect(screen.getByText('Needs action')).toBeInTheDocument();
    expect(screen.getByText('Estimates')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('switches the sales mix dimension and keeps the admin card grid in two columns', () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    expect(screen.getByText('CCTV')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Location' }));
    expect(screen.getAllByText('Aurangabad Hub').length).toBeGreaterThan(0);

    const businessFlowSection = screen.getByText('Business flow').closest('section');
    expect(businessFlowSection?.parentElement?.className).toContain('xl:grid-cols-2');

    const purchasingTile = screen.getByText('Purchasing').closest('article');
    expect(purchasingTile?.parentElement?.className).toContain('sm:grid-cols-2');
  });

  it('opens see all sheets for sales mix and recent activity', () => {
    useSellerDashboardMock.mockReturnValue({ data: adminData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={adminData} initialPeriod="week" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'See all' })[0]!);
    const salesMixDialog = screen.getByRole('dialog');
    expect(within(salesMixDialog).getByText('Sales mix')).toBeInTheDocument();
    expect(within(salesMixDialog).getByText('Zeta')).toBeInTheDocument();
    fireEvent.click(within(salesMixDialog).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'See all' })[2]!);
    const recentActivityDialogs = screen.getAllByRole('dialog');
    expect(within(recentActivityDialogs[recentActivityDialogs.length - 1] as HTMLElement).getByText('SO-001')).toBeInTheDocument();
  });
});
