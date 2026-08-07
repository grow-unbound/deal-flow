import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandDetailPage } from '@/components/seller/brands/detail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/brands/b1',
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrandDetail: () => ({
    isLoading: false,
    isError: false,
    data: {
      header: {
        id: 'b1', brand_name: 'WineYard Vintners', category: 'Wines', region: 'Nashik', carried_since: '2024-01-01T00:00:00Z',
        skus: 10, portfolio_share_pct: 10, status_label: 'ON PACE', status_tone: 'success', initials: 'WY', hue: 'teal',
      },
      meta_strip_4: { member_product_count: 10, selling_product_count_qtd: 6, selling_units_qtd: 120, sales_qtd_value: 1000, sales_qtd_count: 8, selling_product_out_of_stock_count: 1, low_stock_product_count: 2, days_since_catalog: 1, last_sent_date: '2026-01-01T00:00:00Z' },
      details: { id: 'b1', tenant_id: 't1', master_brand_id: 'm1', display_name_override: 'WineYard', margin_pct: 15, exclusivity: false, is_active: true, external_ref: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null },
      performance: { monthly_trend: [], cohort_breakdown: [], top_skus: [], top_buyers: [], catalog_history: [], insights: { margin_avg_pct: 15, sell_through_pct: 0, repeat_rate_pct: 0, buyer_reach: '1/2' } },
      buyers_total: 1,
      buyers: [{ id: 'buyer-1', name: 'Singh Hospitality', cohort: 'Tier A', spend: 100, orders: 1, last_order: null, status: 'Active', city: 'Bengaluru' }],
      catalogs: [{ id: 'c1', name: 'Summer Pours', cohort: 'Tier A', gmv: 500, orders: 1, status: 'published', sent_at: '2026-01-01T00:00:00Z' }],
      activity: [{ id: 'a1', at: '2026-01-01T00:00:00Z', action: 'update', entity_type: 'tenant_brand', entity_id: 'b1', summary: 'updated tenant_brand', diff: null }],
    },
  }),
  useUpdateTenantBrand: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveTenantBrand: () => ({ archive: vi.fn() }),
  useBrandBuyers: () => ({
    data: {
      rows: [{ id: 'buyer-1', name: 'Singh Hospitality', cohort: 'Tier A', spend: 100, orders: 1, last_order: null, status: 'Active', city: 'Bengaluru' }],
      total: 1,
      limit: 50,
      offset: 0,
    },
    isFetching: false,
  }),
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

describe('brand-detail-page integration', () => {
  it('loads details by default and allows switching tabs', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.queryByRole('tab', { name: /Performance/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Details/i })).toHaveClass('border-ember-500');
    fireEvent.click(screen.getByRole('tab', { name: /Buyers/i }));
    expect(screen.getByText('Singh Hospitality')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Activity/i })).not.toBeInTheDocument();
  });
});
