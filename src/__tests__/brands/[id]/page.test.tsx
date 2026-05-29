import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useTenantBrandDetailMock = vi.fn();
const useUpdateTenantBrandMock = vi.fn();
const useArchiveTenantBrandMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrandDetail: (...args: unknown[]) => useTenantBrandDetailMock(...args),
  useUpdateTenantBrand: (...args: unknown[]) => useUpdateTenantBrandMock(...args),
  useArchiveTenantBrand: (...args: unknown[]) => useArchiveTenantBrandMock(...args),
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
    gmv_mtd: 1680000,
    growth_pct: 12,
    active_buyers: 38,
    total_buyers: 142,
    low_stock_skus: 4,
    days_since_catalog: 3,
    last_sent_date: '2026-06-24T00:00:00Z',
    latest_catalog_name: 'Summer Pours',
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

  it('defaults to performance tab and shows breadcrumb link', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.getByRole('button', { name: /Performance/i })).toHaveClass('border-teal-500');
    expect(screen.getByRole('link', { name: 'Brands' })).toHaveAttribute('href', '/brands');
  });

  it('shows buyers/catalogs count badges on tabs', () => {
    render(<BrandDetailPage id="b1" />);

    expect(screen.getByRole('button', { name: /Buyers 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Catalogs 1/i })).toBeInTheDocument();
  });

  it('shows archive confirmation and confirms archive', () => {
    const archive = vi.fn();
    useArchiveTenantBrandMock.mockReturnValue({ archive });

    render(<BrandDetailPage id="b1" />);

    fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    expect(screen.getByText(/Archive this brand\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm archive/i }));
    expect(archive).toHaveBeenCalledTimes(1);
  });
});
