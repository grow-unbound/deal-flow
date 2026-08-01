// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const usePriceListsLandingMock = vi.fn();
const useFlagMock = vi.fn();
const storageFactory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/price-lists',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListsLanding: (...args: unknown[]) => usePriceListsLandingMock(...args),
  useCreatePriceList: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAssistant: false }),
}));

import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';

describe('price lists landing integration', () => {
  beforeEach(() => {
    usePriceListsLandingMock.mockReset();
    useFlagMock.mockReset();
    Object.defineProperty(globalThis, 'localStorage', { value: storageFactory(), configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: storageFactory(), configurable: true });
  });

  it('renders flag-off state and does not fetch data', () => {
    useFlagMock.mockReturnValue(false);

    render(<PriceListsLandingClient initialData={null} />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(usePriceListsLandingMock).not.toHaveBeenCalled();
  });

  it('supports search filtering', () => {
    useFlagMock.mockReturnValue(true);
    usePriceListsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        kpis: {
          active_lists: 1,
          draft_lists: 1,
          expiring_soon: 0,
          cohorts_covered: 1,
          cohorts_total: 2,
          products_with_overrides: 1,
          products_with_custom_prices: 1,
          customers_with_custom_prices: 3,
          products_below_base_rate: 1,
        },
        todays_read: {
          expiring_soon: [],
          most_coverage: [],
          uncovered_cohorts: [],
        },
        price_lists: [
          {
            id: 'pl-active',
            name: 'A List',
            priority: 1,
            currency: 'INR',
            valid_from: '2026-05-01T00:00:00Z',
            valid_to: '2026-06-01T00:00:00Z',
            updated_at: '2026-05-20T00:00:00Z',
            created_at: '2026-05-01T00:00:00Z',
            status: 'active',
            status_tone: 'success',
            cohorts_count: 1,
            cohort_names: ['North'],
            product_count: 5,
            avg_discount_pct: 5,
            avg_margin_pct: 30,
            created_by_label: 'owner@yukti.so',
            is_expiring_soon: false,
            pricing_strategy: 'edit_each' as const,
            strategy_value: null,
          },
          {
            id: 'pl-expired',
            name: 'B List',
            priority: 0,
            currency: 'INR',
            valid_from: '2026-03-01T00:00:00Z',
            valid_to: '2026-03-31T00:00:00Z',
            updated_at: '2026-04-01T00:00:00Z',
            created_at: '2026-03-01T00:00:00Z',
            status: 'expired',
            status_tone: 'neutral',
            cohorts_count: 1,
            cohort_names: ['South'],
            product_count: 4,
            avg_discount_pct: null,
            avg_margin_pct: null,
            created_by_label: 'owner@yukti.so',
            is_expiring_soon: false,
            pricing_strategy: 'edit_each' as const,
            strategy_value: null,
          },
        ],
        cohorts_total: 2,
        counts: { active: 1, draft: 0, expired: 1 },
      },
    });

    render(<PriceListsLandingClient initialData={null} />);

    expect(screen.getByText('2 price lists')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search price list…'), { target: { value: 'A List' } });
    expect(screen.getByText('A List')).toBeInTheDocument();
    expect(screen.queryByText('B List')).not.toBeInTheDocument();
  });

  it('seeds the landing search from the URL-provided initialSearch', async () => {
    useFlagMock.mockReturnValue(true);
    usePriceListsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        kpis: {
          active_lists: 0,
          draft_lists: 0,
          expiring_soon: 0,
          cohorts_covered: 0,
          cohorts_total: 0,
          products_with_overrides: 0,
          products_with_custom_prices: 0,
          customers_with_custom_prices: 0,
          products_below_base_rate: 0,
        },
        todays_read: {
          expiring_soon: [],
          most_coverage: [],
          uncovered_cohorts: [],
        },
        price_lists: [],
        cohorts_total: 0,
        counts: { active: 0, draft: 0, expired: 0 },
      },
    });

    render(<PriceListsLandingClient initialData={null} initialSearch="north" />);

    await waitFor(() => {
      expect(usePriceListsLandingMock).toHaveBeenLastCalledWith({ search: 'north', status: [] }, null);
    });

    expect(screen.getByLabelText('Search price list…')).toHaveValue('north');
  });
});
