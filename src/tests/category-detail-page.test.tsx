import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCategoryDetailMock = vi.fn();
const invalidateQueriesMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategoryDetail: () => useCategoryDetailMock(),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({ state: 'products', setState: vi.fn() }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAdmin: true }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/components/seller/settings/CategoryFormSheet', () => ({
  CategoryFormSheet: () => null,
}));

import { CategoryDetailPage } from '@/components/seller/categories/detail/CategoryDetailPage';

describe('category detail page', () => {
  it('hides performance and defaults to products', () => {
    useCategoryDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'cat-1',
          tenant_id: 'tenant-1',
          name: 'Spirits',
          slug: 'spirits',
          description: 'High velocity spirits',
          is_active: true,
          display_order: 1,
          external_ref: null,
          r2_image_thumb_key: null,
          r2_image_original_key: null,
          r2_image_medium_key: null,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          initials: 'SP',
          hue: 'teal',
          status_label: 'Active',
          status_tone: 'success',
          active_sku_count: 12,
          brand_count: 4,
        },
        meta_strip_4: {
          sales_qtd_value: 100000,
          sales_qtd_count: 18,
          selling_product_count_qtd: 9,
          total_product_count: 12,
          purchasing_customers_qtd: 20,
          brand_count: 4,
          sold_sku_count: 9,
          oos_sku_count: 2,
          low_stock_sku_count: 3,
          active_sku_count: 12,
        },
        overview: {
          trend_weekly: [],
          stock_health: {
            active_sku_count: 12,
            oos_sku_count: 2,
            low_stock_sku_count: 3,
            uncovered_sku_count: 1,
          },
          top_brands: [],
        },
        products: [],
        brands: [],
        activity: [],
      },
    });

    render(<CategoryDetailPage id="cat-1" />);

    expect(screen.queryByRole('tab', { name: 'Performance' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Products/i })).toHaveClass('border-ember-500');
    expect(screen.getByRole('tab', { name: /^Brands/i })).toBeInTheDocument();
  });
});
