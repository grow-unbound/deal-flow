import type { ImgHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useCartMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt?: string; [key: string]: unknown }) => <img alt={alt} {...(props as ImgHTMLAttributes<HTMLImageElement>)} />,
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: (...args: unknown[]) => useCartMock(...args),
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationForward: vi.fn(),
}));

import { ProductCard } from '@/components/buyer/catalog/ProductCard';

describe('buyer product card', () => {
  it('shows compact product identity and price treatment', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    render(
      <ProductCard
        item={{
          id: '1',
          tenant_product_id: 'tp-1',
          campaign_id: null,
          catalog_name: null,
          catalog_valid_until: null,
          internal_sku: 'CP-UNC-TC21ZL6C-VMDS',
          display_name: '2mp IP Bullet Camera 60m Motorized CP Plus',
          brand_id: null,
          brand_name: 'CP Plus',
          category_id: null,
          category_name: null,
          mrp: 14200,
          price: 12400,
          has_campaign_price: true,
          resolved_price: 14200,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: '2026-07-31T00:00:00.000Z',
          image_urls: [],
          stock_status: 'available',
          on_hand: 10,
        }}
      />,
    );

    expect(screen.getByText('2mp IP Bullet Camera 60m Motorized CP Plus')).toBeInTheDocument();
    expect(screen.getByText('CP-UNC-TC21ZL6C-VMDS')).toBeInTheDocument();
    expect(screen.getByText('₹12,400')).toBeInTheDocument();
    expect(screen.getByText('₹14,200')).toBeInTheDocument();
    expect(screen.queryByText('Your price')).not.toBeInTheDocument();
    expect(screen.queryByText('MRP')).not.toBeInTheDocument();
    expect(screen.queryByText('CP Plus')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /add to cart/i })).toHaveClass('h-8', 'w-8');
  });
});
