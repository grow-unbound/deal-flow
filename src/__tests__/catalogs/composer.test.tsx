import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const pushMock = vi.fn();
const useCatalogComposerBootstrapMock = vi.fn();
const useCatalogComposerProductsMock = vi.fn();
const useCatalogComposerDetailMock = vi.fn();
const useCohortComposerBuyersMock = vi.fn();
const useTenantLocationOptionsMock = vi.fn();
const useComposerPublishPreviewMock = vi.fn();
const useSaveCatalogComposerMock = vi.fn();

const COHORT_1_ID = '11111111-1111-4111-8111-111111111111';
const COHORT_2_ID = '22222222-2222-4222-8222-222222222222';
const BUYER_1_ID = '33333333-3333-4333-8333-333333333333';
const BUYER_2_ID = '44444444-4444-4444-8444-444444444444';
const PRICE_LIST_1_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_1_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_2_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_3_ID = '88888888-8888-4888-8888-888888888888';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
  };
});

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogComposerBootstrap: (...args: unknown[]) => useCatalogComposerBootstrapMock(...args),
  useCatalogComposerProducts: (...args: unknown[]) => useCatalogComposerProductsMock(...args),
  useCatalogComposerDetail: (...args: unknown[]) => useCatalogComposerDetailMock(...args),
  useComposerPublishPreview: (...args: unknown[]) => useComposerPublishPreviewMock(...args),
  useSaveCatalogComposer: (...args: unknown[]) => useSaveCatalogComposerMock(...args),
}));

// SellerBuyerPickerOverlay (rendered inside CatalogComposer) calls these directly.
vi.mock('@/hooks/useCohorts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCohorts')>();
  return {
    ...actual,
    useCohortComposerBuyers: (...args: unknown[]) => useCohortComposerBuyersMock(...args),
  };
});

vi.mock('@/hooks/useLocations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useLocations')>();
  return {
    ...actual,
    useTenantLocationOptions: (...args: unknown[]) => useTenantLocationOptionsMock(...args),
  };
});

import { CatalogComposer } from '@/components/seller/catalogs/CatalogComposer';

const bootstrap = {
  cohorts: [
    { id: COHORT_1_ID, name: 'North Delhi · A-class', member_count: 12 },
    { id: COHORT_2_ID, name: 'South Delhi · A-class', member_count: 8 },
  ],
  buyer_count: 2,
  can_view_cost: true,
  buyers: [
    {
      id: BUYER_1_ID,
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
      id: BUYER_2_ID,
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
  price_lists: [{ id: PRICE_LIST_1_ID, name: 'North A draft', status: 'draft' as const, valid_from: null, valid_to: null }],
  price_list_items: [{ price_list_id: PRICE_LIST_1_ID, tenant_product_id: PRODUCT_1_ID, price: 700 }],
  products: [
    {
      id: PRODUCT_1_ID,
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
      id: PRODUCT_2_ID,
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
      id: PRODUCT_3_ID,
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
    useCatalogComposerProductsMock.mockReset();
    useCohortComposerBuyersMock.mockReset();
    useTenantLocationOptionsMock.mockReset();
    useComposerPublishPreviewMock.mockReset();
    useCatalogComposerBootstrapMock.mockReturnValue({
      data: bootstrap,
      isLoading: false,
      isError: false,
    });
    useCatalogComposerProductsMock.mockImplementation(() => {
      const current = useCatalogComposerBootstrapMock();
      const products = current.data?.products ?? [];
      return {
        data: { pages: [{ products, total: current.data?.product_count ?? products.length, nextCursor: null }] },
        isLoading: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      };
    });
    useCatalogComposerDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    useComposerPublishPreviewMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    useCohortComposerBuyersMock.mockReturnValue({
      data: { pages: [{ buyers: [], selected_buyers: [], total: 0, nextCursor: null }] },
      isLoading: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    useTenantLocationOptionsMock.mockReturnValue({
      data: [],
      isLoading: false,
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
          cohort_id: COHORT_1_ID,
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: PRODUCT_1_ID, display_order: 0 },
            { tenant_product_id: PRODUCT_3_ID, display_order: 1 },
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

    fireEvent.click(screen.getByRole('button', { name: /Reset tags/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
    });
  });

  it('hydrates saved manual pricing strategy and row prices in edit mode', async () => {
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
          cohort_id: COHORT_1_ID,
          price_source: 'manual',
          price_list_id: null,
          pricing_strategy: { mode: 'flat_off_base', value: '75' },
          filters: {
            brand_names: ['Solar Estates', 'Luna Cellars'],
            category_names: ['Red wine', 'White wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: PRODUCT_1_ID, display_order: 0, price_override: 675 },
            { tenant_product_id: PRODUCT_2_ID, display_order: 1, price_override: 605 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    expect(screen.getByText('Flat discount off base price')).toBeInTheDocument();
    expect(screen.getByDisplayValue('75')).toBeInTheDocument();
    expect(screen.getByDisplayValue('675')).toBeInTheDocument();
    expect(screen.getByDisplayValue('605')).toBeInTheDocument();
  });

  it('hydrates persisted percent-off strategy even when the visible table is only partially loaded', async () => {
    useCatalogComposerProductsMock.mockReturnValue({
      data: { pages: [{ products: [bootstrap.products[0]], selected_products: [], total: bootstrap.products.length, nextCursor: null }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
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
          cohort_id: COHORT_1_ID,
          price_source: 'manual',
          price_list_id: null,
          pricing_strategy: { mode: 'percent_off_base', value: '12' },
          filters: {
            brand_names: ['Solar Estates', 'Luna Cellars'],
            category_names: ['Red wine', 'White wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: PRODUCT_1_ID, display_order: 0, price_override: 660 },
            { tenant_product_id: PRODUCT_2_ID, display_order: 1, price_override: 598.4 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    expect(screen.getByText('% off base price')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
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
          cohort_id: COHORT_1_ID,
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: PRODUCT_1_ID, display_order: 0 },
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
          cohort_id: COHORT_1_ID,
          filters: {
            brand_names: ['Solar Estates'],
            category_names: ['Red wine'],
            availability: 'show_everything',
          },
          tag_overrides: {},
          items: [
            { tenant_product_id: PRODUCT_1_ID, display_order: 0 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<CatalogComposer mode="edit" catalogId="cat-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Publish updates/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Push campaign updates for eligible buyers/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Publish updates does not send WhatsApp updates/i)).toBeInTheDocument();
  });
});
