import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const pushMock = vi.fn();
const useCatalogComposerBootstrapMock = vi.fn();
const useCatalogComposerDetailMock = vi.fn();
const useSaveCatalogComposerMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogComposerBootstrap: (...args: unknown[]) => useCatalogComposerBootstrapMock(...args),
  useCatalogComposerDetail: (...args: unknown[]) => useCatalogComposerDetailMock(...args),
  useSaveCatalogComposer: (...args: unknown[]) => useSaveCatalogComposerMock(...args),
}));

import { CatalogComposer } from '@/components/seller/catalogs/CatalogComposer';

const bootstrap = {
  cohorts: [
    { id: 'cohort-1', name: 'North Delhi · A-class', member_count: 12 },
    { id: 'cohort-2', name: 'South Delhi · A-class', member_count: 8 },
  ],
  products: [
    {
      id: 'p-1',
      display_name: 'Solar Reserve 750ml',
      internal_sku: 'SKU-001',
      brand_name: 'Solar Estates',
      category_name: 'Red wine',
      mrp: 1000,
      base_selling_price: 750,
      qty_available: 42,
      reorder_point: 10,
      units_mtd: 8,
      days_cover: 12,
      tag: 'new' as const,
      stock_added_today: true,
      stock_label: '42',
      stock_tone: 'success' as const,
    },
    {
      id: 'p-2',
      display_name: 'Luna Blanc 750ml',
      internal_sku: 'SKU-002',
      brand_name: 'Luna Cellars',
      category_name: 'White wine',
      mrp: 900,
      base_selling_price: 680,
      qty_available: 6,
      reorder_point: 8,
      units_mtd: 4,
      days_cover: 5,
      tag: 'new_stock' as const,
      stock_added_today: false,
      stock_label: '6',
      stock_tone: 'warning' as const,
    },
    {
      id: 'p-3',
      display_name: 'Heritage Port 750ml',
      internal_sku: 'SKU-003',
      brand_name: 'Solar Estates',
      category_name: 'Red wine',
      mrp: 1200,
      base_selling_price: 880,
      qty_available: 0,
      reorder_point: 4,
      units_mtd: 0,
      days_cover: null,
      tag: 'old_stock' as const,
      stock_added_today: false,
      stock_label: 'Out',
      stock_tone: 'neutral' as const,
    },
  ],
};

describe('CatalogComposer', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCatalogComposerBootstrapMock.mockReturnValue({
      data: bootstrap,
      isLoading: false,
      isError: false,
    });
    useCatalogComposerDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    useSaveCatalogComposerMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ catalog: { id: 'cat-1', status: 'draft' } }),
      isPending: false,
    });
  });

  it('renders the composer chrome and panels in create mode', () => {
    render(<CatalogComposer mode="create" />);

    expect(screen.getByRole('heading', { name: /Add a catalog/i })).toBeInTheDocument();
    expect(screen.getByText('Catalog summary')).toBeInTheDocument();
    expect(screen.getByText('Product Category')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search SKU or product name/i)).toBeInTheDocument();
  });

  it('shows products when category_name is null and filters are initialized', async () => {
    useCatalogComposerBootstrapMock.mockReturnValue({
      data: {
        cohorts: bootstrap.cohorts,
        products: bootstrap.products.map((product) => ({ ...product, category_name: null })),
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="create" />);

    await waitFor(() => {
      expect(screen.getByText('Solar Reserve 750ml')).toBeInTheDocument();
      expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    });
  });

  it('brand/category filters support select all and affect the table', async () => {
    render(<CatalogComposer mode="create" />);

    const clearAllButtons = screen.getAllByRole('button', { name: /Clear all/i });
    fireEvent.click(clearAllButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/No products match the current filters and search/i)).toBeInTheDocument();
    });
  });

  it('availability filter switches the visible products', async () => {
    render(<CatalogComposer mode="create" />);

    fireEvent.click(screen.getByLabelText(/Old Stock/i));

    await waitFor(() => {
      expect(screen.getByText('Heritage Port 750ml')).toBeInTheDocument();
      expect(screen.queryByText('Solar Reserve 750ml')).not.toBeInTheDocument();
    });
  });

  it('search filters by product name, sku, and brand', async () => {
    render(<CatalogComposer mode="create" />);

    fireEvent.change(screen.getByPlaceholderText(/Search SKU or product name/i), {
      target: { value: 'SKU-002' },
    });

    await waitFor(() => {
      expect(screen.getByText('Luna Blanc 750ml')).toBeInTheDocument();
      expect(screen.queryByText('Solar Reserve 750ml')).not.toBeInTheDocument();
    });
  });

  it('row selection updates summary counts', async () => {
    render(<CatalogComposer mode="create" />);

    const rowCheckboxes = within(screen.getAllByRole('rowgroup')[1]).getAllByRole('checkbox');
    fireEvent.click(rowCheckboxes[0]);

    await waitFor(() => {
      const productsStat = screen.getByText('Products').parentElement?.lastElementChild;
      expect(productsStat).toHaveTextContent('2');
    });
  });

  it('hydrates edit mode and reset restores tag overrides', async () => {
    useCatalogComposerDetailMock.mockReturnValue({
      data: {
        header: { name: 'Saved Catalog' },
        composer: {
          name: 'Saved Catalog',
          status: 'draft',
          valid_from: '2026-06-01T00:00:00.000Z',
          valid_to: '2026-06-30T00:00:00.000Z',
          cohort_id: 'cohort-1',
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: 'p-1', display_order: 0 },
            { tenant_product_id: 'p-3', display_order: 1 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    expect(screen.getByDisplayValue('Saved Catalog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Bulk adjust/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mark as New Stock/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset overrides/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
    });
  });

  it('bulk adjust applies a tag override to selected rows', async () => {
    render(<CatalogComposer mode="create" />);

    fireEvent.click(screen.getByRole('button', { name: /Bulk adjust/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mark as Old Stock/i }));

    await waitFor(() => {
      const overridesStat = screen.getByText('Manual tag overrides').parentElement?.lastElementChild;
      expect(overridesStat).toHaveTextContent('3');
    });
  });
});
