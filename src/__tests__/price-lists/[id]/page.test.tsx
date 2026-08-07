import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePriceListDetailMock = vi.fn();
const useRoleMock = vi.fn();
const mutateMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'pl-1' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/price-lists/pl-1',
}));

vi.mock('@/components/FeatureGate', () => ({ FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/auth/RoleGuard', () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));

vi.mock('@/hooks/useRole', () => ({ useRole: () => useRoleMock() }));
vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListDetail: () => usePriceListDetailMock(),
  useUpdatePriceListItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePriceListAction: () => ({ mutate: mutateMock, isPending: false }),
}));

import PriceListDetailPage from '../../../../app/(seller)/price-lists/[id]/page';

const detail = {
  id: 'pl-1',
  name: 'Summer Promo',
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
  status_tone: 'success' as const,
  initials: 'SP',
  created_by_label: 'owner@yukti.so',
  filters: { brand_names: ['WineYard'], category_names: ['Red'] },
  items: [
    {
      id: 'i-1',
      price_list_id: 'pl-1',
      tenant_product_id: 'p-1',
      price: 900,
      min_qty: 1,
      max_qty: null,
      tenant_product: {
        id: 'p-1',
        internal_sku: 'SKU-01',
        name_override: 'Cabernet',
        mrp: 1200,
        base_selling_price: 1000,
        cost_price: 600,
        master_product: { name: 'Cabernet' },
        is_active: true,
        tenant_brand: { id: 'b-1', display_name_override: 'WineYard', master_brand: { name: 'WineYard' } },
      },
    },
  ],
  assignments: [
    {
      id: 'a-1',
      price_list_id: 'pl-1',
      target_type: 'cohort' as const,
      target_id: 'c-1',
      created_at: '2026-05-05T00:00:00Z',
      label: 'North Retail',
      members: 8,
      priority: 1,
    },
  ],
  stats: { products_covered: 1, brands_covered: 1, assignments_count: 1, assigned_buyer_count: 1, assigned_cohort_count: 0, avg_discount_pct: 10, avg_margin_pct: 20, days_left: 12 },
};

describe('price-lists/[id] detail page', () => {
  beforeEach(() => {
    useRoleMock.mockReturnValue({ isSellerAdmin: true });
    usePriceListDetailMock.mockReturnValue({ isLoading: false, isError: false, data: { price_list: detail } });
    mutateMock.mockReset();
  });

  it('renders 4 meta tiles and Products and pricing tab with count', () => {
    render(<PriceListDetailPage />);

    expect(screen.getByText('Products covered')).toBeInTheDocument();
    expect(screen.getByText('Cohorts assigned')).toBeInTheDocument();
    expect(screen.getByText('Avg discount')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Products and pricing/i })).toHaveTextContent('1');
  });

  it('renders edit and archive actions for seller admin', () => {
    render(<PriceListDetailPage />);
    expect(screen.getByRole('button', { name: /Edit pricelist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archive Pricelist/i })).toBeInTheDocument();
  });

  it('shows filters applied card and discount column', () => {
    render(<PriceListDetailPage />);
    expect(screen.getByText('Filters applied')).toBeInTheDocument();
    expect(screen.getAllByText('WineYard').length).toBeGreaterThanOrEqual(1);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    const markup = screen.getByText('-10.00%');
    expect(markup.className).toContain('text-teal-700');
  });
});
