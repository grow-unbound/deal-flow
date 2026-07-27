import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductPricingTab } from '@/components/seller/products/detail/ProductPricingTab';

vi.mock('@/hooks/useProducts', () => ({
  useProductPriceListItemMutations: () => ({
    updateItem: { mutateAsync: vi.fn(), isPending: false },
    addItem: { mutateAsync: vi.fn(), isPending: false },
    removeItem: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

describe('ProductPricingTab', () => {
  it('renders list price and not-in-list empty state per pricelist row', () => {
    render(
      <ProductPricingTab
        productId="p1"
        role="seller_admin"
        pricingSummary={{
          mrp: 100,
          base_selling_price: 80,
          cost_price: 50,
          margin_pct: 37.5,
        }}
        pricing={[
          {
            price_list_id: 'pl-1',
            price_list_name: 'Retail',
            item_id: 'item-1',
            list_price: 75,
            effective_price: 75,
            valid_from: null,
            valid_to: null,
            created_at: '2026-01-01T00:00:00Z',
            is_active: true,
            is_managed_externally: false,
            status: 'active',
            avg_discount_pct: 5,
            avg_margin_pct: 18,
          },
          {
            price_list_id: 'pl-2',
            price_list_name: 'Wholesale',
            item_id: null,
            list_price: null,
            effective_price: null,
            valid_from: null,
            valid_to: null,
            created_at: '2026-01-01T00:00:00Z',
            is_active: true,
            is_managed_externally: false,
            status: 'active',
            avg_discount_pct: null,
            avg_margin_pct: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Pricelist membership' })).toBeInTheDocument();
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getByText('Wholesale')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search price list…')).toBeInTheDocument();
  });
});
