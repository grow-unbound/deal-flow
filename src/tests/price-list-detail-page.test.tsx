import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePriceListDetailMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'pl-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/components/FeatureGate', () => ({ FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/auth/RoleGuard', () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isSellerAdmin: true }) }));
vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListDetail: () => usePriceListDetailMock(),
  useUpdatePriceListItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePriceListAction: () => ({ mutate: vi.fn(), isPending: false }),
  useAddAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssignment: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: () => ({ data: { buyers: [], cohorts: [] } }),
  };
});

import PriceListDetailPage from '../../app/(seller)/price-lists/[id]/page';

describe('price-list-detail-page', () => {
  beforeEach(() => {
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
          created_by_label: 'owner@dealflow.in',
          items: [{
            id: 'i-1', price_list_id: 'pl-1', tenant_product_id: 'p-1', price: 1200, min_qty: 1, max_qty: null,
            tenant_product: {
              id: 'p-1', internal_sku: 'SKU-01', name_override: 'Cabernet', mrp: null, base_selling_price: 1000,
              master_product: { name: 'Cabernet' }, is_active: true,
              tenant_brand: { id: 'b-1', display_name_override: 'WineYard', master_brand: { name: 'WineYard' } },
            },
          }],
          assignments: [],
          stats: { products_covered: 1, brands_covered: 1, assignments_count: 0, avg_discount_pct: -20, days_left: 1 },
          activity: [],
        },
      },
    });
  });

  it('renders markup discount in danger color and 4 meta tiles', () => {
    render(<PriceListDetailPage />);
    expect(screen.getByText('Products covered')).toBeInTheDocument();
    expect(screen.getByText('Cohorts assigned')).toBeInTheDocument();
    expect(screen.getByText('Avg discount')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();

    const markup = screen.getByText('+20.0%');
    expect(markup.className).toContain('text-danger-700');
  });
});
