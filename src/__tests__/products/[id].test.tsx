import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductDetailPage } from '@/components/seller/products/detail/ProductDetailPage';

const pushMock = vi.fn();
const useProductDetailMock = vi.fn();
const useUpdateProductMock = vi.fn();
const useRoleMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/products/p1',
}));

vi.mock('@/hooks/useProducts', () => ({
  useProductDetail: () => useProductDetailMock(),
  useUpdateProduct: () => useUpdateProductMock(),
  useUpdateProductPriceOverride: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => useRoleMock(),
}));

describe('product detail page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useProductDetailMock.mockReset();
    useUpdateProductMock.mockReset();
    useRoleMock.mockReset();
    useUpdateProductMock.mockReturnValue({ mutate: vi.fn() });
    useRoleMock.mockReturnValue({ isSellerAssistant: false });
  });

  it('renders exactly 4 meta tiles and excludes revenue tile', () => {
    useProductDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        detail: {
          header: {
            name: 'Cabernet',
            brand: 'WineYard',
            sku: 'SKU-1',
            pack: '750 ml',
            mrp: 2800,
            status_label: 'On pace',
            status_tone: 'success',
          },
          meta_strip_4: {
            units_mtd: 120,
            growth_pct: 12,
            days_cover: 14,
            on_hand: 96,
            sell_through_pct: 34,
          },
          details: {
            id: 'p1',
            name: 'Cabernet',
            sku: 'SKU-1',
            category: 'Red wine',
            pack_size: 750,
            default_uom: 'ml',
            mrp: 2800,
            hsn_code: '2204',
            gst_rate: 18,
          },
          performance: {
            units_trend_12w: [],
            sell_through_30d: [],
            stock_cover_12w: [],
          },
          pricing: [],
          activity: [],
          role: 'seller_admin',
        },
      },
    });

    render(<ProductDetailPage id="p1" />);

    expect(screen.getByText('Units · MTD')).toBeInTheDocument();
    expect(screen.getByText('Days of cover')).toBeInTheDocument();
    expect(screen.getByText('On hand')).toBeInTheDocument();
    expect(screen.getByText('Sell-through')).toBeInTheDocument();
    expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
  });

  it('does not render Stock tab and applies days-cover color rules', () => {
    useProductDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        detail: {
          header: {
            name: 'Cabernet',
            brand: 'WineYard',
            sku: 'SKU-1',
            pack: '750 ml',
            mrp: 2800,
            status_label: 'On pace',
            status_tone: 'success',
          },
          meta_strip_4: {
            units_mtd: 120,
            growth_pct: 12,
            days_cover: 0,
            on_hand: 0,
            sell_through_pct: 34,
          },
          details: {
            id: 'p1',
            name: 'Cabernet',
            sku: 'SKU-1',
            category: 'Red wine',
            pack_size: 750,
            default_uom: 'ml',
            mrp: 2800,
            hsn_code: '2204',
            gst_rate: 18,
          },
          performance: {
            units_trend_12w: [],
            sell_through_30d: [],
            stock_cover_12w: [],
          },
          pricing: [],
          activity: [],
          role: 'seller_admin',
        },
      },
    });

    render(<ProductDetailPage id="p1" />);

    expect(screen.queryByRole('button', { name: 'Stock' })).not.toBeInTheDocument();
    expect(screen.getByText('0 d')).toHaveClass('text-danger-700');
  });

  it('hides Performance tab for seller assistants', () => {
    useRoleMock.mockReturnValue({ isSellerAssistant: true });
    useProductDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        detail: {
          header: {
            name: 'Cabernet',
            brand: 'WineYard',
            sku: 'SKU-1',
            pack: '750 ml',
            mrp: 2800,
            status_label: 'On pace',
            status_tone: 'success',
          },
          meta_strip_4: {
            units_mtd: 120,
            growth_pct: 12,
            days_cover: 14,
            on_hand: 96,
            sell_through_pct: 34,
          },
          details: {
            id: 'p1',
            name: 'Cabernet',
            sku: 'SKU-1',
            category: 'Red wine',
            pack_size: 750,
            default_uom: 'ml',
            mrp: 2800,
            hsn_code: '2204',
            gst_rate: 18,
          },
          performance: {
            units_trend_12w: [],
            sell_through_30d: [],
            stock_cover_12w: [],
          },
          pricing_summary: [],
          pricing: [],
          activity: [],
          role: 'seller_assistant',
        },
        product: {},
      },
    });

    render(<ProductDetailPage id="p1" />);

    expect(screen.queryByRole('button', { name: /Performance/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Details/i })).toHaveClass('border-teal-500');
  });
});
