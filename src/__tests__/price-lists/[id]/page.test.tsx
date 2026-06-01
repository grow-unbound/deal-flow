import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePriceListDetailMock = vi.fn();
const useRoleMock = vi.fn();
const mutateMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'pl-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/FeatureGate', () => ({ FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/auth/RoleGuard', () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));

vi.mock('@/hooks/useRole', () => ({ useRole: () => useRoleMock() }));
vi.mock('@/hooks/usePriceLists', () => ({
  usePriceListDetail: () => usePriceListDetailMock(),
  useUpdatePriceListItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePriceListAction: () => ({ mutate: mutateMock, isPending: false }),
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
  status_tone: 'success',
  initials: 'SP',
  created_by_label: 'owner@dealflow.in',
  items: [{
    id: 'i-1', price_list_id: 'pl-1', tenant_product_id: 'p-1', price: 900, min_qty: 1, max_qty: null,
    tenant_product: {
      id: 'p-1', internal_sku: 'SKU-01', name_override: 'Cabernet', mrp: null, base_selling_price: 1000,
      master_product: { name: 'Cabernet' }, is_active: true,
      tenant_brand: { id: 'b-1', display_name_override: 'WineYard', master_brand: { name: 'WineYard' } },
    },
  }],
  assignments: [{ id: 'a-1', price_list_id: 'pl-1', target_type: 'cohort', target_id: 'c-1', created_at: '2026-05-05T00:00:00Z', label: 'North Retail', members: 8, priority: 1 }],
  stats: { products_covered: 1, brands_covered: 1, assignments_count: 1, avg_discount_pct: 10, days_left: 12 },
  activity: [{ id: 1, action: 'update', diff: { event: 'item_price_updated' }, ts: '2026-05-10T00:00:00Z' }],
};

describe('price-lists/[id] detail page', () => {
  beforeEach(() => {
    useRoleMock.mockReturnValue({ isSellerAdmin: true });
    usePriceListDetailMock.mockReturnValue({ isLoading: false, isError: false, data: { price_list: detail } });
    mutateMock.mockReset();
  });

  it('renders 4 meta tiles and assignment badge count', () => {
    render(<PriceListDetailPage />);

    expect(screen.getByText('Products covered')).toBeInTheDocument();
    expect(screen.getByText('Cohorts assigned')).toBeInTheDocument();
    expect(screen.getByText('Avg discount')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assignments/i })).toHaveTextContent('1');
  });

  it('shows extend validity only for active or draft status', () => {
    render(<PriceListDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(screen.getByText('Extend validity')).toBeInTheDocument();

    usePriceListDetailMock.mockReturnValueOnce({ isLoading: false, isError: false, data: { price_list: { ...detail, status: 'expired', status_label: 'Expired', status_tone: 'neutral' } } });
    render(<PriceListDetailPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '' })[1]);
    expect(screen.queryByText('Extend validity')).not.toBeInTheDocument();
  });
});
