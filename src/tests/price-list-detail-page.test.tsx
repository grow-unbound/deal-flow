import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePriceListDetailMock = vi.fn();

const useParamsMock = vi.fn(() => ({ id: 'pl-1' }));

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/price-lists/pl-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/FeatureGate', () => ({ FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/auth/RoleGuard', () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isSellerAdmin: true }) }));
vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListDetail: () => usePriceListDetailMock(),
  usePriceListAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import PriceListDetailPage from '../../app/(seller)/price-lists/[id]/page';

describe('price-list-detail-page', () => {
  beforeEach(() => {
    useParamsMock.mockReturnValue({ id: 'pl-1' });
    usePriceListDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        price_list: {
          id: 'pl-1',
          name: 'Markup List',
          currency: 'INR',
          valid_from: '2026-05-01T00:00:00Z',
          valid_to: '2026-06-30T00:00:00Z',
          priority: 1,
          is_active: true,
          tenant_id: 't-1',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-10T00:00:00Z',
          status: 'active',
          status_label: 'Active',
          status_tone: 'success',
          initials: 'ML',
          created_by_label: 'owner@yukti.so',
          filters: { brand_names: [], category_names: [] },
          items: [
            {
              id: 'i-1',
              price_list_id: 'pl-1',
              tenant_product_id: 'p-1',
              price: 1200,
              min_qty: 1,
              max_qty: null,
              tenant_product: {
                id: 'p-1',
                internal_sku: 'SKU-01',
                name_override: 'Cabernet',
                mrp: null,
                base_selling_price: 1000,
                cost_price: 400,
                master_product: { name: 'Cabernet' },
                is_active: true,
                tenant_brand: { id: 'b-1', display_name_override: 'WineYard', master_brand: { name: 'WineYard' } },
              },
            },
          ],
          assignments: [],
          stats: { products_covered: 1, brands_covered: 1, assignments_count: 0, avg_discount_pct: -20, days_left: 1 },
        },
      },
    });
  });

  it('renders the 4 Detail Pulse tiles from the metrics-v2 spec (doc lines 691-699)', () => {
    render(<PriceListDetailPage />);
    expect(screen.getByText('Products priced')).toBeInTheDocument();
    expect(screen.getByText('Customers reached')).toBeInTheDocument();
    expect(screen.getByText('Typical discount')).toBeInTheDocument();
    expect(screen.getByText('Items below cost/floor')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Activity/i })).not.toBeInTheDocument();

    // The one mocked item (price 1200) is priced above its base_selling_price (1000),
    // i.e. no discounted/below-floor items, so both derived tiles read 0.
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows the skeleton while the route param is not ready yet', () => {
    useParamsMock.mockReturnValue({});
    render(<PriceListDetailPage />);

    expect(screen.queryByText('Price list not found.')).not.toBeInTheDocument();
  });
});
