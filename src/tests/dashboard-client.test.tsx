import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSellerLandingPeriodMock = vi.fn();
const useSellerDashboardMock = vi.fn();
const useRetainedValueMock = vi.fn();

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: (...args: unknown[]) => useSellerLandingPeriodMock(...args),
}));

vi.mock('@/hooks/useSellerDashboard', () => ({
  useSellerDashboard: (...args: unknown[]) => useSellerDashboardMock(...args),
}));

vi.mock('@/hooks/useRetainedValue', () => ({
  useRetainedValue: (...args: unknown[]) => useRetainedValueMock(...args),
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
  admin: {
    metrics: [
      { label: 'Orders · This Week', value: 12 },
      { label: 'GMV · This Week', value: 420000, tone: 'accent' },
      { label: 'Active catalogs', value: 3 },
      { label: 'Low-stock alerts', value: 2, tone: 'warn' },
    ],
    callouts: [
      { kind: 'info', eyebrow: 'Orders pulse', hint: '12 in scope', rows: [] },
      { kind: 'opportunity', eyebrow: 'Catalog watch', hint: '1 expiring', rows: [] },
      { kind: 'risk', eyebrow: 'Collections', hint: '2 overdue', rows: [] },
    ],
    top_brands: [
      { id: 'brand-1', initials: 'WY', name: 'WineYard', pct: 62, trend_label: '62% share', hue: 'teal' },
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
      { kind: 'risk', eyebrow: 'Needs action', hint: '1 overdue', rows: [] },
      { kind: 'info', eyebrow: 'Recent activity', hint: 'Since your last sign-in', rows: [] },
      { kind: 'opportunity', eyebrow: 'Re-engage', hint: 'Dormant for 30+ days', rows: [] },
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

    expect(screen.getByText('Brand performance')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /showing.*this week/i }));
    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(await screen.findByText('This Quarter')).toBeInTheDocument();
  });

  it('renders the assistant dashboard variant without admin-only widgets', () => {
    useSellerDashboardMock.mockReturnValue({ data: assistantData, isLoading: false, isError: false });

    render(<SellerDashboardClient initialData={assistantData} initialPeriod="week" />);

    expect(screen.queryByText('Brand performance')).not.toBeInTheDocument();
    expect(screen.getByText('Needs action')).toBeInTheDocument();
    expect(screen.getByText('Estimates')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });
});
