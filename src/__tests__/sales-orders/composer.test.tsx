import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocComposerSalesOrder } from '@/components/seller/sales-orders/DocComposerSalesOrder';
import type { SalesOrderComposerBuyerContext, SalesOrderComposerDocument, SalesOrderComposerProductSearchRow } from '@/types/sales-order-composer';
import type { TenantEstimateDetailResponse } from '@/types/tenant-estimate-detail';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useFlagStateMock = vi.fn();
const useSalesOrderComposerMock = vi.fn();
const useSaveSalesOrderComposerMock = vi.fn();
const useBuyerSalesOrderContextMock = vi.fn();
const useEstimateProductSearchMock = vi.fn();
const useDebouncedSalesOrderStockCheckMock = vi.fn();
const useNextSalesOrderNumberMock = vi.fn();
const useEstimateComposerSOMock = vi.fn();
const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'seller@example.com', displayName: 'Phani' },
  }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useEstimates', () => ({
  useEstimateComposer: (...args: unknown[]) => useEstimateComposerSOMock(...args),
  useEstimateProductSearch: (...args: unknown[]) => useEstimateProductSearchMock(...args),
  useEstimateProductPricing: () => ({ data: {}, isLoading: false }),
  useEstimatePriceListOptions: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useDocumentBuyerPicker', () => ({
  useDocumentBuyerPicker: () => ({
    data: [{ id: 'buyer-1', business_name: 'Acme Retail', place_of_supply: 'Delhi' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useSalesOrders', () => ({
  useSalesOrderComposer: (...args: unknown[]) => useSalesOrderComposerMock(...args),
  useSaveSalesOrderComposer: (...args: unknown[]) => useSaveSalesOrderComposerMock(...args),
  useBuyerSalesOrderContext: (...args: unknown[]) => useBuyerSalesOrderContextMock(...args),
  useDebouncedSalesOrderStockCheck: (...args: unknown[]) => useDebouncedSalesOrderStockCheckMock(...args),
  useNextSalesOrderNumber: (...args: unknown[]) => useNextSalesOrderNumberMock(...args),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
}));

function baseBuyer(overrides: Partial<SalesOrderComposerBuyerContext> = {}): SalesOrderComposerBuyerContext {
  return {
    id: 'buyer-1',
    business_name: 'Acme Retail',
    contact_name: 'Priya',
    phone: '9999999999',
    email: 'buyer@example.com',
    gstin: '07AAAAA0000A1Z5',
    bill_address: 'Delhi, 110001',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    place_of_supply: 'Delhi',
    seller_state: 'Maharashtra',
    payment_terms_days: 21,
    credit_limit: 5000,
    credit_used: 4500,
    credit_available: 500,
    active_pricelist: { id: 'pl-1', name: 'North Delhi A-class' },
    sales_agent_name: 'Phani',
    ...overrides,
  };
}

function baseDocument(overrides: Partial<SalesOrderComposerDocument> = {}): SalesOrderComposerDocument {
  return {
    id: 'so-1',
    order_number: 'SO-2026-00001',
    status: 'draft',
    buyer_id: null,
    location_id: null,
    available_locations: [],
    order_date: '2026-06-07',
    expected_delivery: '2026-06-14',
    buyer_po_ref: '',
    place_of_supply: '',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    has_backorder: false,
    estimate_id: null,
    source_estimate_number: null,
    items: [],
    buyer_context: null,
    ...overrides,
  };
}

function estimateForSoPrefill(): TenantEstimateDetailResponse {
  return {
    id: 'est-1',
    estimate_number: 'EST-2026-00021',
    status: 'draft',
    buyer_id: 'buyer-1',
    location_id: 'loc-1',
    available_locations: [{ id: 'loc-1', name: 'Main warehouse', is_default: true }],
    date_issued: '2026-06-01',
    valid_until: '2026-06-15',
    buyer_po_ref: 'PO-1',
    place_of_supply: 'Delhi',
    seller_note: 'Note',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_at: null,
    sent_channel: null,
    items: [
      {
        id: 'li-1',
        tenant_product_id: 'tp-1',
        product_name: 'Vinikus Shiraz Reserve',
        sku: 'SKU-001',
        brand_name: 'Vinikus',
        brand_initials: 'VI',
        brand_hue: 'teal',
        hsn_code: '2204',
        on_hand: 10,
        qty: 1,
        unit_price: 1180,
        mrp: 1500,
        base_selling_price: 1180,
        disc_pct: 0,
        tax_pct: 18,
        line_total: 1392,
        scheme_tag: null,
      },
    ],
    buyer_context: baseBuyer(),
    estimate_version: 1,
    viewed_at: null,
    viewed_by_name: null,
    voided_at: null,
    converted_to_order_id: null,
    linked_order_number: null,
  } as unknown as TenantEstimateDetailResponse;
}

const searchRow: SalesOrderComposerProductSearchRow = {
  tenant_product_id: 'tp-1',
  product_name: 'Vinikus Shiraz Reserve',
  sku: 'SKU-001',
  brand_name: 'Vinikus',
  brand_initials: 'VI',
  brand_hue: 'teal',
  hsn_code: '2204',
  tax_pct: 18,
  on_hand: 2,
  unit_price: 1180,
  mrp: 1500,
  base_selling_price: 1180,
  default_uom: 'bottle',
  pack_size: 750,
};

function renderComposer(props: ComponentProps<typeof DocComposerSalesOrder>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocComposerSalesOrder {...props} />
    </QueryClientProvider>,
  );
}

describe('DocComposerSalesOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    apiPostMock.mockResolvedValue({ ok: true, json: async () => ({ data: baseDocument() }) });
    apiPatchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'so-1', redirect_path: '/sales-orders/so-1' } }),
    });

    useFlagStateMock.mockReturnValue(true);
    useSaveSalesOrderComposerMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useEstimateProductSearchMock.mockReturnValue({ data: [], isLoading: false });
    useBuyerSalesOrderContextMock.mockReturnValue({ data: null, isLoading: false });
    useDebouncedSalesOrderStockCheckMock.mockReturnValue({ data: [], isLoading: false });
    useNextSalesOrderNumberMock.mockReturnValue({ data: 'SO-2026-00001', isLoading: false });
    useEstimateComposerSOMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
    useSalesOrderComposerMock.mockImplementation((id: string | null) => ({
      data: id ? baseDocument() : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));
  });

  it('does not POST sales order draft on mount for new order', async () => {
    renderComposer({ mode: 'create' });
    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('renders expected delivery and confirm order on new sales order', async () => {
    renderComposer({ mode: 'create' });

    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    expect(screen.getByText('Sales order #')).toBeInTheDocument();
    expect(screen.getByText('SO-2026-00001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm order/i })).toBeDisabled();
  });

  it('shows stock warning and swaps footer CTA to confirm with backorder', async () => {
    useBuyerSalesOrderContextMock.mockImplementation((buyerId: string | null) => ({
      data: buyerId ? baseBuyer() : null,
      isLoading: false,
    }));
    useEstimateProductSearchMock.mockImplementation((query: string) => ({
      data: query ? [searchRow] : [],
      isLoading: false,
    }));

    renderComposer({ mode: 'create' });

    fireEvent.focus(screen.getByPlaceholderText(/Search buyer/i));
    fireEvent.click(await screen.findByRole('button', { name: /Acme Retail/i }, { timeout: 8000 }));
    await screen.findByText(/Credit headroom/i);
    fireEvent.change(screen.getByPlaceholderText(/Search product/i), { target: { value: 'Shiraz' } });
    fireEvent.click(await screen.findByRole('option', { name: /Vinikus Shiraz Reserve/i }));
    const qtyInput = (await screen.findAllByDisplayValue('1'))[0];
    fireEvent.change(qtyInput, { target: { value: '3' } });

    await waitFor(
      () => {
        expect(screen.getByText(/1 line\(s\) over stock/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Confirm with backorder/i })).toBeEnabled();
        expect(screen.queryByRole('button', { name: /^Confirm order$/i })).not.toBeInTheDocument();
      },
      { timeout: 12_000 },
    );
  }, 15_000);

  it('shows from-estimate subtitle when prefilled from estimate', async () => {
    useEstimateComposerSOMock.mockImplementation((id: string | null) => ({
      data: id === 'est-1' ? estimateForSoPrefill() : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));

    renderComposer({ mode: 'create', fromEstimateId: 'est-1' });

    expect(await screen.findByText(/Pre-filled from EST-2026-00021/i)).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('locks buyer swap in confirmed edit mode while keeping line editing enabled', async () => {
    useSalesOrderComposerMock.mockReturnValue({
      data: baseDocument({
        status: 'confirmed',
        buyer_id: 'buyer-1',
        buyer_context: baseBuyer({ credit_limit: 20000, credit_used: 2000, credit_available: 18000 }),
        items: [
          {
            id: 'line-1',
            tenant_product_id: 'tp-1',
            product_name: 'Vinikus Shiraz Reserve',
            sku: 'SKU-001',
            brand_name: 'Vinikus',
            brand_initials: 'VI',
            brand_hue: 'teal',
            hsn_code: '2204',
            on_hand: 24,
            qty: 1,
            unit_price: 1180,
            mrp: 1500,
            base_selling_price: 1180,
            disc_pct: 0,
            tax_pct: 18,
            line_total: 1392,
            scheme_tag: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    renderComposer({ mode: 'edit', orderId: 'so-1' });

    expect(await screen.findByText(/Editing · confirmed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change/i })).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('1')[0]).toBeInTheDocument();
  });
});
