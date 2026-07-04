import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const pushMock = vi.fn();
const useCatalogComposerBootstrapMock = vi.fn();
const useCatalogComposerDetailMock = vi.fn();
const useSaveCatalogComposerMock = vi.fn();

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
  };
});

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
  buyer_count: 2,
  can_view_cost: true,
  buyers: [
    {
      id: 'buyer-1',
      business_name: 'Bharat Stores',
      contact_name: 'Ravi',
      external_ref: 'B-001',
      city: 'Delhi',
      state: 'NCR',
      geography_label: 'Delhi, NCR',
      tier: 'A' as const,
      credit_limit: 100000,
      payment_terms_days: 21,
      orders_30d: 2,
      gmv_30d: 50000,
      last_order_at: '2026-06-01T00:00:00.000Z',
      initials: 'BS',
      hue: 'teal' as const,
    },
    {
      id: 'buyer-2',
      business_name: 'Kumar Wines',
      contact_name: 'Anil',
      external_ref: 'B-002',
      city: 'Gurgaon',
      state: 'HR',
      geography_label: 'Gurgaon, HR',
      tier: 'B' as const,
      credit_limit: 80000,
      payment_terms_days: 14,
      orders_30d: 0,
      gmv_30d: 0,
      last_order_at: null,
      initials: 'KW',
      hue: 'ember' as const,
    },
  ],
  buyer_filters: {
    geographies: [{ value: 'Delhi, NCR', label: 'Delhi, NCR', count: 1 }],
    tiers: [{ value: 'A', label: 'A', count: 1 }],
  },
  price_lists: [{ id: 'pl-1', name: 'North A draft', status: 'draft' as const, valid_from: null, valid_to: null }],
  price_list_items: [{ price_list_id: 'pl-1', tenant_product_id: 'p-1', price: 700 }],
  products: [
    {
      id: 'p-1',
      display_name: 'Solar Reserve 750ml',
      internal_sku: 'SKU-001',
      brand_name: 'Solar Estates',
      category_name: 'Red wine',
      mrp: 1000,
      base_selling_price: 750,
      cost_price: 500,
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
      cost_price: 450,
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
      cost_price: 650,
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

    expect(screen.getByRole('heading', { name: /Add a campaign/i })).toBeInTheDocument();
    expect(screen.getByText('Customer group')).toBeInTheDocument();
    expect(screen.getByText('Product Category')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search SKU or product name/i)).toBeInTheDocument();
  });

  it('shows products when category_name is null and filters are initialized', async () => {
    useCatalogComposerBootstrapMock.mockReturnValue({
      data: {
        cohorts: bootstrap.cohorts,
        buyer_count: bootstrap.buyer_count,
        can_view_cost: bootstrap.can_view_cost,
        buyers: bootstrap.buyers,
        buyer_filters: bootstrap.buyer_filters,
        price_lists: bootstrap.price_lists,
        price_list_items: bootstrap.price_list_items,
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

  it('brand/category filters are filter-out and affect the table', async () => {
    render(<CatalogComposer mode="create" />);

    fireEvent.click(screen.getByLabelText(/Luna Cellars/i));

    await waitFor(() => {
      expect(screen.getByText('Luna Blanc 750ml')).toBeInTheDocument();
      expect(screen.queryByText('Solar Reserve 750ml')).not.toBeInTheDocument();
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
          live_status: 'draft',
          has_unpublished_changes: false,
          valid_from: '2026-06-01T00:00:00.000Z',
          valid_to: '2026-06-30T00:00:00.000Z',
          scope_type: 'cohort',
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
    fireEvent.click(screen.getByRole('button', { name: /Bulk tags/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Bulk tags/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mark as Old Stock/i }));

    await waitFor(() => {
      const overridesStat = screen.getByText('Manual tag overrides').parentElement?.lastElementChild;
      expect(overridesStat).toHaveTextContent('3');
    });
  });

  it('warns before saving unpublished changes for a live catalog edit', async () => {
    useCatalogComposerDetailMock.mockReturnValue({
      data: {
        header: { name: 'Live Catalog' },
        composer: {
          name: 'Live Catalog',
          status: 'draft',
          live_status: 'published',
          has_unpublished_changes: false,
          valid_from: '2026-06-01T00:00:00.000Z',
          valid_to: '2026-06-30T00:00:00.000Z',
          scope_type: 'cohort',
          cohort_id: 'cohort-1',
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: 'p-1', display_order: 0 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    fireEvent.change(screen.getByDisplayValue('Live Catalog'), {
      target: { value: 'Live Catalog v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Save unpublished changes/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('warns before publishing updates for a live catalog edit', async () => {
    useCatalogComposerDetailMock.mockReturnValue({
      data: {
        header: { name: 'Live Catalog' },
        composer: {
          name: 'Live Catalog',
          status: 'draft',
          live_status: 'published',
          has_unpublished_changes: true,
          valid_from: '2026-06-01T00:00:00.000Z',
          valid_to: '2026-06-30T00:00:00.000Z',
          scope_type: 'cohort',
          cohort_id: 'cohort-1',
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: 'p-1', display_order: 0 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Publish updates/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Publish updates to buyers/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/will see this updated campaign/i)).toBeInTheDocument();
  });
});
