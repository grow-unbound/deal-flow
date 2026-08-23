import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const pushMock = vi.fn();
const usePriceListsLandingMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/price-lists',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListsLanding: () => usePriceListsLandingMock(),
  useCreatePriceList: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTenantPriceListsMetrics: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAssistant: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    tenantProfile: { role: 'seller_admin' },
    currentTenantId: 'tenant-1',
  }),
}));

import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';

const mockData = {
  kpis: {
    active_lists: 1,
    draft_lists: 1,
    expiring_soon: 1,
    cohorts_covered: 1,
    cohorts_total: 2,
    products_with_overrides: 2,
    products_with_custom_prices: 2,
    customers_with_custom_prices: 14,
    products_below_base_rate: 1,
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
      avg_margin_pct: 22.5,
      created_by_label: 'owner@yukti.so',
      is_expiring_soon: true,
      pricing_strategy: 'edit_each' as const,
      strategy_value: null,
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
      avg_margin_pct: null,
      created_by_label: 'owner@yukti.so',
      is_expiring_soon: false,
      pricing_strategy: 'flat_off_base' as const,
      strategy_value: 25,
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
      cohorts_count: 0,
      cohort_names: [],
      product_count: 3,
      avg_discount_pct: 2,
      avg_margin_pct: 18,
      created_by_label: 'owner@yukti.so',
      is_expiring_soon: false,
      pricing_strategy: 'margin_from_mrp' as const,
      strategy_value: 10,
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
    if (typeof window !== 'undefined' && window.localStorage) {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const k = window.sessionStorage.key(i);
        if (k) keys.push(k);
      }
      keys.forEach((k) => window.sessionStorage.removeItem(k));
    }
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
    render(<PriceListsLandingClient initialData={null} />);
    expect(screen.getAllByText('Expiring soon')[0]).toBeInTheDocument();
    expect(screen.getAllByText('1')[0]).toBeInTheDocument();
  });

  it('renders the new custom pricing KPI values instead of placeholders', () => {
    render(<PriceListsLandingClient initialData={null} />);

    const customerTile = screen.getByText('Customers with active custom pricing').closest('article');
    const belowBaseTile = screen.getByText('Products priced below base rate').closest('article');

    expect(customerTile).toBeTruthy();
    expect(belowBaseTile).toBeTruthy();
    expect(within(customerTile as HTMLElement).getByText('14')).toBeInTheDocument();
    expect(within(belowBaseTile as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('expired chip hides active and draft rows', () => {
    render(<PriceListsLandingClient initialData={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Expired' }));

    expect(screen.getByText('Old Window')).toBeInTheDocument();
    expect(screen.getByText('Old Window').closest('tr')).toBeInTheDocument();
    const landingRows = screen.getAllByRole('row');
    expect(landingRows.some((row) => row.textContent?.includes('May Promo'))).toBe(false);
    expect(landingRows.some((row) => row.textContent?.includes('June Launch'))).toBe(false);
  });

  it('renders uncovered cohorts callout rows', () => {
    render(<PriceListsLandingClient initialData={null} />);

    const uncoveredPanel = screen.getByText('Uncovered cohorts').closest('article');

    expect(uncoveredPanel).toBeTruthy();
    expect(within(uncoveredPanel as HTMLElement).getByText(/South Retail/i)).toBeInTheDocument();
    expect(within(uncoveredPanel as HTMLElement).getByText('14')).toBeInTheDocument();
  });

  it('shows pricing strategy under name and em dash cohort when unassigned', () => {
    const { container } = render(<PriceListsLandingClient initialData={null} />);
    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    const body = tbody as HTMLElement;
    expect(within(body).getAllByText(/independent product pricing/i)).toHaveLength(2);
    expect(within(body).getAllByText(/flat ₹25 off base price/i)).toHaveLength(2);
    expect(within(body).getAllByText(/10% off base price/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Expired' }));
    const expiredRow = within(body).getByText('Old Window').closest('tr');
    expect(expiredRow?.textContent).not.toContain('Unassigned');
  });

  it('navigates to detail on row click', () => {
    const { container } = render(<PriceListsLandingClient initialData={null} />);
    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    const promoCell = within(tbody as HTMLElement).getByText('May Promo');
    const row = promoCell.closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(pushMock).toHaveBeenCalledWith('/price-lists/pl-active');
  });
});
