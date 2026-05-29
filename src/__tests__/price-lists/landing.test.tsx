import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const usePriceListsLandingMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListsLanding: () => usePriceListsLandingMock(),
  useCreatePriceList: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

import PriceListsPage from '../../../app/(seller)/price-lists/page';

const mockData = {
  kpis: {
    active_lists: 1,
    draft_lists: 1,
    expiring_soon: 1,
    cohorts_covered: 1,
    cohorts_total: 2,
    products_with_overrides: 2,
  },
  todays_read: {
    expiring_soon: [
      {
        id: 'pl-active',
        name: 'May Promo',
        initials: 'MP',
        valid_until: '2026-05-31T00:00:00Z',
        valid_until_label: '31 May 2026',
        cohorts_count: 1,
        status: 'active',
        status_tone: 'success',
      },
    ],
    most_coverage: [
      {
        id: 'pl-active',
        name: 'May Promo',
        initials: 'MP',
        product_count: 20,
        valid_until: '2026-05-31T00:00:00Z',
        valid_until_label: '31 May 2026',
      },
    ],
    uncovered_cohorts: [
      {
        id: 'cohort-2',
        name: 'South Retail',
        initials: 'SR',
        member_count: 14,
      },
    ],
  },
  price_lists: [
    {
      id: 'pl-active',
      name: 'May Promo',
      priority: 1,
      currency: 'INR',
      valid_from: '2026-05-01T00:00:00Z',
      valid_to: '2026-05-31T00:00:00Z',
      updated_at: '2026-05-25T00:00:00Z',
      created_at: '2026-05-01T00:00:00Z',
      status: 'active',
      status_tone: 'success',
      cohorts_count: 1,
      cohort_names: ['Tier A'],
      product_count: 20,
      avg_discount_pct: 8,
      created_by_label: 'owner@dealflow.in',
      is_expiring_soon: true,
    },
    {
      id: 'pl-draft',
      name: 'June Launch',
      priority: 2,
      currency: 'INR',
      valid_from: '2026-06-01T00:00:00Z',
      valid_to: '2026-06-30T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
      created_at: '2026-05-20T00:00:00Z',
      status: 'draft',
      status_tone: 'warning',
      cohorts_count: 2,
      cohort_names: ['Tier A', 'Tier B'],
      product_count: 11,
      avg_discount_pct: null,
      created_by_label: 'owner@dealflow.in',
      is_expiring_soon: false,
    },
    {
      id: 'pl-expired',
      name: 'Old Window',
      priority: 0,
      currency: 'INR',
      valid_from: '2026-04-01T00:00:00Z',
      valid_to: '2026-04-30T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      created_at: '2026-04-01T00:00:00Z',
      status: 'expired',
      status_tone: 'neutral',
      cohorts_count: 1,
      cohort_names: ['Tier C'],
      product_count: 3,
      avg_discount_pct: 2,
      created_by_label: 'owner@dealflow.in',
      is_expiring_soon: false,
    },
  ],
  cohorts_total: 2,
  counts: {
    active: 1,
    draft: 1,
    expired: 1,
  },
};

describe('price lists landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    usePriceListsLandingMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    usePriceListsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockData,
      refetch: vi.fn(),
    });
  });

  it('shows expiring soon KPI from backend', () => {
    render(<PriceListsPage />);
    expect(screen.getByText('Expiring soon')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('expired chip hides active and draft rows', () => {
    render(<PriceListsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Expired' }));

    expect(screen.getByText('Old Window')).toBeInTheDocument();
    expect(screen.queryByText('May Promo')).not.toBeInTheDocument();
    expect(screen.queryByText('June Launch')).not.toBeInTheDocument();
  });

  it('renders uncovered cohorts callout rows', () => {
    render(<PriceListsPage />);

    expect(screen.getByText('Uncovered cohorts')).toBeInTheDocument();
    expect(screen.getByText(/South Retail/i)).toBeInTheDocument();
    expect(screen.getByText(/falling back to base price/i)).toBeInTheDocument();
  });

  it('navigates to detail on row click', () => {
    render(<PriceListsPage />);

    fireEvent.click(screen.getByText('May Promo'));
    expect(pushMock).toHaveBeenCalledWith('/price-lists/pl-active');
  });
});
