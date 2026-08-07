import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Page renders components that call useQueryClient()/useQuery() for real — needs a provider.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const useTenantBrandDetailMock = vi.fn();
const useUpdateTenantBrandMock = vi.fn();
const useArchiveTenantBrandMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/brands/b1',
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrandDetail: (...args: unknown[]) => useTenantBrandDetailMock(...args),
  useUpdateTenantBrand: (...args: unknown[]) => useUpdateTenantBrandMock(...args),
  useArchiveTenantBrand: (...args: unknown[]) => useArchiveTenantBrandMock(...args),
  useCreateTenantBrand: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTenantBrands: () => ({ data: undefined }),
  useSearchMasterBrands: () => ({ data: undefined, isLoading: false }),
}));

import { BrandDetailPage } from '@/components/seller/brands/detail';

const mockData = {
  header: {
    id: 'b1',
    brand_name: 'WineYard Vintners',
    category: 'Wines',
    region: 'Nashik, Maharashtra',
    carried_since: '2024-01-01T00:00:00Z',
    skus: 12,
    portfolio_share_pct: 35.5,
    status_label: 'ON PACE',
    status_tone: 'success' as const,
    initials: 'WY',
    hue: 'teal' as const,
  },
  meta_strip_4: {
    member_product_count: 142,
    selling_product_count_qtd: 96,
    selling_units_qtd: 3400,
    sales_qtd_value: 1680000,
    sales_qtd_count: 210,
    selling_product_out_of_stock_count: 4,
    low_stock_product_count: 9,
    days_since_catalog: 3,
    last_sent_date: '2026-06-24T00:00:00Z',
  },
  details: {
    id: 'b1',
    tenant_id: 't1',
    master_brand_id: 'm1',
    display_name_override: 'WineYard Vintners',
    margin_pct: 18,
    exclusivity: false,
    is_active: true,
    external_ref: 'WY-001',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
  performance: {
    monthly_trend: [{ month: '2026-01', revenue: 10000 }],
    cohort_breakdown: [{ cohort: 'Tier A', spend: 10000 }],
    top_skus: [{ product_id: 'p1', product: 'Cabernet', units: 10, revenue: 1000, growth: 0, days_cover: 5, status: 'On pace' }],
    top_buyers: [{ id: 'u1', name: 'Singh', cohort: 'Tier A', spend: 3000, orders: 2, orders_label: '2 orders', last_order: null, status: 'Active', city: 'Bengaluru' }],
    catalog_history: [{ id: 'c1', name: 'Summer', cohort: 'Tier A', gmv: 410000, orders: 14, status: 'published', sent_at: '2026-06-24T00:00:00Z' }],
    insights: { margin_avg_pct: 18, sell_through_pct: 71, repeat_rate_pct: 64, buyer_reach: '38/142' },
  },
  buyers: [{ id: 'u1', name: 'Singh', cohort: 'Tier A', spend: 1000, orders: 1, last_order: '2026-05-01T00:00:00Z', status: 'Active', city: 'Bengaluru' }],
  catalogs: [{ id: 'c1', name: 'Summer', cohort: 'Tier A', gmv: 410000, orders: 14, status: 'published', sent_at: '2026-06-24T00:00:00Z' }],
  activity: [{ id: 'a1', at: '2026-06-24T00:00:00Z', action: 'update', entity_type: 'tenant_brand', entity_id: 'b1', summary: 'updated tenant_brand', diff: null }],
};

describe('brand detail page', () => {
  beforeEach(() => {
    useTenantBrandDetailMock.mockReturnValue({ data: mockData, isLoading: false, isError: false });
    useUpdateTenantBrandMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useArchiveTenantBrandMock.mockReturnValue({ archive: vi.fn() });
  });

  it('defaults to details tab and shows breadcrumb link', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.queryByRole('tab', { name: /Performance/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Details/i })).toHaveClass('border-ember-500');
    expect(screen.getByRole('link', { name: 'Brands' })).toHaveAttribute('href', '/brands');
  });

  it('shows buyers/catalogs count badges on tabs', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.getByRole('tab', { name: /Buyers1|Buyers\s*1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Catalogs1|Catalogs\s*1/i })).toBeInTheDocument();
  });

  it('renders archive control in header', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.getByRole('button', { name: /Archive brand/i })).toBeInTheDocument();
  });
});
