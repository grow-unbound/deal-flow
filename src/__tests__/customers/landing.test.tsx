import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useCustomersLandingMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLanding: () => useCustomersLandingMock(),
  useCreateCustomerOptimistic: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({ InviteUserDialog: () => null }));

import CustomersPage from '../../../app/(seller)/customers/page';

describe('customers landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCustomersLandingMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
  });

  it('shows active buyers based on backend values', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 10, active: 6, active_pct: 60, spend_mtd: 100000, spend_growth_pct: 10, dormant_over_30d: 2, outstanding_dues: 50000, buyers_with_dues: 2 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        buyers: [],
      },
    });

    render(<CustomersPage />);

    expect(screen.getByText('Active buyers')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('has dues filter hides zero-dues buyers', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 2, active: 2, active_pct: 100, spend_mtd: 20000, spend_growth_pct: 5, dormant_over_30d: 0, outstanding_dues: 1000, buyers_with_dues: 1 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        buyers: [
          { id: 'b1', business_name: 'Due Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 15000, spend_prev_mtd: 12000, growth_pct: 25, orders_mtd: 2, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 1000, dues: 1000, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'DB', hue: 'teal' } },
          { id: 'b2', business_name: 'Zero Buyer', tier: 'B', city: 'Mysuru', cohort: 'Growth', spend_mtd: 5000, spend_prev_mtd: 5000, growth_pct: 0, orders_mtd: 1, last_order_at: '2026-05-18T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'ZB', hue: 'cream' } },
        ],
      },
    });

    render(<CustomersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Has dues' }));

    expect(screen.getByText('Due Buyer')).toBeInTheDocument();
    expect(screen.queryByText('Zero Buyer')).not.toBeInTheDocument();
  });

  it('clicking row navigates to /customers/{id}', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 1, active: 1, active_pct: 100, spend_mtd: 20000, spend_growth_pct: 5, dormant_over_30d: 0, outstanding_dues: 0, buyers_with_dues: 0 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        buyers: [
          { id: 'buyer-123', business_name: 'Route Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 10000, spend_prev_mtd: 9000, growth_pct: 11, orders_mtd: 1, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 0, dues: 0, status: { label: 'Healthy', tone: 'success' }, avatar: { initials: 'RB', hue: 'teal' } },
        ],
      },
    });

    render(<CustomersPage />);
    fireEvent.click(screen.getByText('Route Buyer'));

    expect(pushMock).toHaveBeenCalledWith('/customers/buyer-123');
  });

  it('credit bar uses warning color above 75%', () => {
    useCustomersLandingMock.mockReturnValue({
      isLoading: false,
      data: {
        kpis: { cohort_count: 1, total: 1, active: 1, active_pct: 100, spend_mtd: 20000, spend_growth_pct: 5, dormant_over_30d: 0, outstanding_dues: 9000, buyers_with_dues: 1 },
        callouts: { needs_call: [], top_spenders: [], top_risers: [] },
        buyers: [
          { id: 'buyer-1', business_name: 'Credit Buyer', tier: 'A', city: 'Bengaluru', cohort: 'Premium', spend_mtd: 10000, spend_prev_mtd: 9000, growth_pct: 11, orders_mtd: 1, last_order_at: '2026-05-20T00:00:00Z', credit_limit: 10000, credit_used: 9000, dues: 9000, status: { label: 'Needs follow-up', tone: 'warning' }, avatar: { initials: 'CB', hue: 'teal' } },
        ],
      },
    });

    const { container } = render(<CustomersPage />);
    expect(container.querySelector('.bg-warning-500')).toBeTruthy();
  });
});
