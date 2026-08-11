import type { ImgHTMLAttributes, ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCartMock = vi.fn();
const useBuyerMeMock = vi.fn();

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

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationForward: vi.fn(),
  navigateBuyerBack: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { ProductCard } from '@/components/buyer/catalog/ProductCard';

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('buyer product card', () => {
  beforeEach(() => {
    useBuyerMeMock.mockReset();
    useBuyerMeMock.mockReturnValue({
      data: {
        buyer_id: 'buyer-1',
        tenant: { id: 'tenant-1' },
        stock_visibility: { enabled: false, block_order_on_oos: false },
      },
    });
  });

  it('shows compact product identity and price treatment', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    renderWithQueryClient(
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

  it('shows readable out-of-stock badge without dimming the details panel', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });
    useBuyerMeMock.mockReturnValue({
      data: {
        buyer_id: 'buyer-1',
        tenant: { id: 'tenant-1' },
        stock_visibility: { enabled: true, block_order_on_oos: false },
      },
    });

    const { container } = renderWithQueryClient(
      <ProductCard
        item={{
          id: '2',
          tenant_product_id: 'tp-2',
          campaign_id: null,
          catalog_name: null,
          catalog_valid_until: null,
          internal_sku: 'CP-OOS-001',
          display_name: 'Unavailable Camera',
          brand_id: null,
          brand_name: 'CP Plus',
          category_id: null,
          category_name: null,
          mrp: 10000,
          price: 9000,
          has_campaign_price: false,
          resolved_price: null,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: null,
          image_urls: [],
          stock_status: 'out_of_stock',
          on_hand: 0,
        }}
      />,
    );

    expect(screen.getByText('Out of stock')).toHaveClass('text-[var(--danger-500)]');
    expect(container.firstChild).not.toHaveClass('opacity-60');
    expect(screen.getByRole('button', { name: /add to cart/i })).not.toBeDisabled();
  });

  it('shows a promotion badge for campaign-priced products outside campaign detail views', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    renderWithQueryClient(
      <ProductCard
        item={{
          id: 'promo-1',
          tenant_product_id: 'tp-promo-1',
          campaign_id: 'camp-1',
          campaign_name: 'Monsoon Promo',
          internal_sku: 'PROMO-001',
          display_name: 'Promo Camera',
          brand_id: null,
          brand_name: 'CP Plus',
          category_id: null,
          category_name: null,
          mrp: 10000,
          price: 8500,
          has_campaign_price: true,
          resolved_price: 10000,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: '2026-07-31T00:00:00.000Z',
          image_urls: [],
          stock_status: 'available',
          on_hand: 10,
        }}
      />,
    );

    expect(screen.getByText('Special Price')).toBeInTheDocument();
  });

  it('can suppress the promotion badge on campaign detail views', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    renderWithQueryClient(
      <ProductCard
        showPromotionBadge={false}
        item={{
          id: 'promo-2',
          tenant_product_id: 'tp-promo-2',
          campaign_id: 'camp-2',
          campaign_name: 'Flash Promo',
          internal_sku: 'PROMO-002',
          display_name: 'Promo Dome Camera',
          brand_id: null,
          brand_name: 'CP Plus',
          category_id: null,
          category_name: null,
          mrp: 10000,
          price: 8200,
          has_campaign_price: true,
          resolved_price: 10000,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: '2026-07-31T00:00:00.000Z',
          image_urls: [],
          stock_status: 'available',
          on_hand: 10,
        }}
      />,
    );

    expect(screen.queryByText('Promotion')).not.toBeInTheDocument();
  });

  it('falls back to the category image when the product has no image', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    renderWithQueryClient(
      <ProductCard
        item={{
          id: '3',
          tenant_product_id: 'tp-3',
          campaign_id: null,
          catalog_name: null,
          catalog_valid_until: null,
          internal_sku: 'CAT-FALLBACK-001',
          display_name: 'Category Fallback Camera',
          brand_id: null,
          brand_name: 'CP Plus',
          brand_logo_url: null,
          category_id: 'cat-1',
          category_name: 'Cameras',
          category_image_url: 'https://cdn.example.com/category-thumb.webp',
          mrp: 10000,
          price: 9000,
          has_campaign_price: false,
          resolved_price: null,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: null,
          image_urls: [],
          stock_status: 'available',
          on_hand: 6,
        }}
      />,
    );

    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://cdn.example.com/category-thumb.webp');
  });

  it('prefers the category image over the brand image when the product image is missing', () => {
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });

    renderWithQueryClient(
      <ProductCard
        item={{
          id: '4',
          tenant_product_id: 'tp-4',
          campaign_id: null,
          catalog_name: null,
          catalog_valid_until: null,
          internal_sku: 'CAT-BRAND-FALLBACK-001',
          display_name: 'Category Before Brand Camera',
          brand_id: 'brand-1',
          brand_name: 'CP Plus',
          brand_logo_url: 'https://cdn.example.com/brand-logo.webp',
          category_id: 'cat-1',
          category_name: 'Cameras',
          category_image_url: 'https://cdn.example.com/category-thumb.webp',
          mrp: 10000,
          price: 9000,
          has_campaign_price: false,
          resolved_price: null,
          default_uom: 'box',
          pack_size: null,
          campaign_valid_until: null,
          image_urls: [],
          stock_status: 'available',
          on_hand: 6,
        }}
      />,
    );

    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://cdn.example.com/category-thumb.webp');
  });
});
