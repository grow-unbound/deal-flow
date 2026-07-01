import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useCustomersLandingMock = vi.fn();
const useCustomersLandingInfiniteMock = vi.fn();
const useFlagMock = vi.fn();
const customerFilterGroups = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' },
      { value: 'Dormant', label: 'Dormant' },
    ],
  },
  {
    key: 'due',
    label: 'Due',
    options: [
      { value: 'Due', label: 'Due' },
      { value: 'Overdue', label: 'Overdue' },
    ],
  },
];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/customers',
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLanding: () => useCustomersLandingMock(),
  useCreateCustomerOptimistic: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCustomersLandingInfinite: (...args: unknown[]) => useCustomersLandingInfiniteMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useBusinessPolicy', () => ({
  useBusinessPolicy: () => ({ creditEnabled: true, gstInclusive: false, gstRate: 18 }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    tenantProfile: { role: 'seller_admin' },
    currentTenantId: 'tenant-1',
  }),
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({ InviteUserDialog: () => null }));

import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';

let landingBuyers: Array<any> = [];

function getInfiniteResult(filters: { status?: string[]; due?: string[] }) {
  const status = filters?.status ?? [];
  const due = filters?.due ?? [];
  const dormantCutoff = new Date('2026-06-01T00:00:00Z').toISOString();
  const overdueIds = new Set(landingBuyers.filter((buyer) => buyer.dues > 0).map((buyer) => buyer.id));
  const buyers = landingBuyers.filter((buyer) => {
    const dormant = !buyer.last_order_at || buyer.last_order_at < dormantCutoff;
    const statusMatch =
      status.length === 0 ||
      status.some((value) => {
        if (value === 'Active') return buyer.is_active && !dormant;
        if (value === 'Inactive') return !buyer.is_active;
        if (value === 'Dormant') return buyer.is_active && dormant;
        return false;
      });
    const dueMatch =
      due.length === 0 ||
      due.some((value) => {
        if (value === 'Due') return buyer.dues > 0;
        if (value === 'Overdue') return overdueIds.has(buyer.id);
        return false;
      });
    return statusMatch && dueMatch;
  });

  return {
    isLoading: false,
    isError: false,
    data: {
      pages: [
        {
          buyers,
          total: buyers.length,
          kpis: { total: buyers.length, active: buyers.filter((buyer) => buyer.orders_mtd > 0).length },
        },
      ],
    },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
}

describe('customers landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCustomersLandingMock.mockReset();
    useCustomersLandingInfiniteMock.mockImplementation((_period: unknown, filters: { status?: string[]; due?: string[] }) => getInfiniteResult(filters));
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    landingBuyers = [];
  });

  it('shows active buyers based on backend values', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 10, active: 6, active_pct: 60, spend_mtd: 100000, spend_growth_pct: 10, dormant_over_30d: 2, outstanding_dues: 50000, buyers_with_dues: 2 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        filters: { groups: customerFilterGroups },
        buyers: [],
      },
    });

    render(<CustomersLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText('Active buyers')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('has due filter hides zero-dues buyers and no longer exposes city/state filters', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 2, active: 2, active_pct: 100, spend_mtd: 20000, spend_growth_pct: 5, dormant_over_30d: 0, outstanding_dues: 1000, buyers_with_dues: 1 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        filters: { groups: customerFilterGroups },
        buyers: [
          { id: 'b1', business_name: 'Due Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 15000, spend_prev_mtd: 12000, growth_pct: 25, orders_mtd: 2, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 1000, dues: 1000, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'DB', hue: 'teal' } },
          { id: 'b2', business_name: 'Zero Buyer', tier: 'B', city: 'Mysuru', cohort: 'Growth', spend_mtd: 5000, spend_prev_mtd: 5000, growth_pct: 0, orders_mtd: 1, last_order_at: '2026-05-18T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'ZB', hue: 'cream' } },
        ],
      },
    });
    landingBuyers = [
      { id: 'b1', business_name: 'Due Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 15000, spend_prev_mtd: 12000, growth_pct: 25, orders_mtd: 2, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 1000, dues: 1000, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'DB', hue: 'teal' }, is_active: true },
      { id: 'b2', business_name: 'Zero Buyer', tier: 'B', city: 'Mysuru', cohort: 'Growth', spend_mtd: 5000, spend_prev_mtd: 5000, growth_pct: 0, orders_mtd: 1, last_order_at: '2026-05-18T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'ZB', hue: 'cream' }, is_active: true },
    ];

    render(<CustomersLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Due: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Due' }));

    expect(screen.getByText('Due Buyer')).toBeInTheDocument();
    expect(screen.queryByText('Zero Buyer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'City: All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State: All' })).not.toBeInTheDocument();
  });

  it('status filter uses lifecycle buckets instead of the table status chip', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 3, active: 2, active_pct: 67, spend_mtd: 30000, spend_growth_pct: 8, dormant_over_30d: 1, outstanding_dues: 0, buyers_with_dues: 0 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        filters: { groups: customerFilterGroups },
        buyers: [
          { id: 'b1', business_name: 'Active Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 15000, spend_prev_mtd: 12000, growth_pct: 25, orders_mtd: 2, last_order_at: '2026-06-20T00:00:00Z', credit_limit: 10000, credit_used: 1000, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'AB', hue: 'teal' }, is_active: true },
          { id: 'b2', business_name: 'Dormant Buyer', tier: 'B', city: 'Mysuru', cohort: 'Growth', spend_mtd: 5000, spend_prev_mtd: 5000, growth_pct: 0, orders_mtd: 1, last_order_at: '2026-01-01T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Dormant', tone: 'danger' }, avatar: { initials: 'DB', hue: 'cream' }, is_active: true },
          { id: 'b3', business_name: 'Inactive Buyer', tier: 'C', city: 'Delhi', cohort: 'Growth', spend_mtd: 0, spend_prev_mtd: 0, growth_pct: 0, orders_mtd: 0, last_order_at: null, credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'IB', hue: 'ember' }, is_active: false },
        ],
      },
    });
    landingBuyers = [
      { id: 'b1', business_name: 'Active Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 15000, spend_prev_mtd: 12000, growth_pct: 25, orders_mtd: 2, last_order_at: '2026-06-20T00:00:00Z', credit_limit: 10000, credit_used: 1000, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'AB', hue: 'teal' }, is_active: true },
      { id: 'b2', business_name: 'Dormant Buyer', tier: 'B', city: 'Mysuru', cohort: 'Growth', spend_mtd: 5000, spend_prev_mtd: 5000, growth_pct: 0, orders_mtd: 1, last_order_at: '2026-01-01T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Dormant', tone: 'danger' }, avatar: { initials: 'DB', hue: 'cream' }, is_active: true },
      { id: 'b3', business_name: 'Inactive Buyer', tier: 'C', city: 'Delhi', cohort: 'Growth', spend_mtd: 0, spend_prev_mtd: 0, growth_pct: 0, orders_mtd: 0, last_order_at: null, credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'IB', hue: 'ember' }, is_active: false },
    ];

    render(<CustomersLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dormant' }));

    expect(useCustomersLandingInfiniteMock).toHaveBeenLastCalledWith('month', expect.objectContaining({ status: ['Dormant'] }));
    expect(screen.getByRole('button', { name: 'Status: Dormant' })).toBeInTheDocument();
  });

  it('credit bar uses warning color above 75%', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 1, active: 1, active_pct: 100, spend_mtd: 20000, spend_growth_pct: 5, dormant_over_30d: 0, outstanding_dues: 9000, buyers_with_dues: 1 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        filters: { groups: customerFilterGroups },
        buyers: [
          { id: 'buyer-1', business_name: 'Credit Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 10000, spend_prev_mtd: 9000, growth_pct: 11, orders_mtd: 1, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 9000, dues: 9000, status: { label: 'Needs follow-up', tone: 'warning' }, avatar: { initials: 'CB', hue: 'teal' } },
        ],
      },
    });
    landingBuyers = [
      { id: 'buyer-1', business_name: 'Credit Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 10000, spend_prev_mtd: 9000, growth_pct: 11, orders_mtd: 1, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 9000, dues: 9000, status: { label: 'Needs follow-up', tone: 'warning' }, avatar: { initials: 'CB', hue: 'teal' }, is_active: true },
    ];

    const { container } = render(<CustomersLandingClient initialData={null} initialPeriod="month" />);
    expect(container.querySelector('.bg-warning-500')).toBeTruthy();
  });
});
