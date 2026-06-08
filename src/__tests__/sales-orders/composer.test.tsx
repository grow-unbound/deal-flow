import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocComposerSalesOrder } from '@/components/seller/sales-orders/DocComposerSalesOrder';
import type { SalesOrderComposerBuyerContext, SalesOrderComposerDocument, SalesOrderComposerProductSearchRow } from '@/types/sales-order-composer';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateSalesOrderDraftMock = vi.fn();
const useSalesOrderComposerMock = vi.fn();
const useSaveSalesOrderComposerMock = vi.fn();
const useConfirmSalesOrderMock = vi.fn();
const useBuyerSalesOrderContextMock = vi.fn();
const useSalesOrderProductSearchMock = vi.fn();
const useDebouncedSalesOrderStockCheckMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useSalesOrders', () => ({
  useCreateSalesOrderDraft: (...args: unknown[]) => useCreateSalesOrderDraftMock(...args),
  useSalesOrderComposer: (...args: unknown[]) => useSalesOrderComposerMock(...args),
  useSaveSalesOrderComposer: (...args: unknown[]) => useSaveSalesOrderComposerMock(...args),
  useConfirmSalesOrder: (...args: unknown[]) => useConfirmSalesOrderMock(...args),
  useBuyerSalesOrderContext: (...args: unknown[]) => useBuyerSalesOrderContextMock(...args),
  useSalesOrderProductSearch: (...args: unknown[]) => useSalesOrderProductSearchMock(...args),
  useDebouncedSalesOrderStockCheck: (...args: unknown[]) => useDebouncedSalesOrderStockCheckMock(...args),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => {
  class QueryMock {
    select() { return this; }
    eq() { return this; }
    limit() { return this; }
    then(resolve: (value: { data: unknown; error: null }) => void) {
      resolve({
        data: [
          {
            id: 'buyer-1',
            business_name: 'Acme Retail',
            geography: { state: 'Delhi' },
            credit_limit: 5000,
          },
        ],
        error: null,
      });
    }
  }
  return {
    createClientComponentClient: () => ({
      schema: () => ({
        from: () => new QueryMock(),
      }),
    }),
  };
});

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
    order_date: '2026-06-07',
    expected_delivery: '2026-06-14',
    buyer_po_ref: '',
    place_of_supply: 'Unknown',
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
  default_uom: 'bottle',
  pack_size: 750,
};

function renderComposer(props: React.ComponentProps<typeof DocComposerSalesOrder>) {
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
    useFlagStateMock.mockReturnValue(true);
    useSaveSalesOrderComposerMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useConfirmSalesOrderMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useSalesOrderProductSearchMock.mockReturnValue({ data: [], isLoading: false });
    useBuyerSalesOrderContextMock.mockReturnValue({ data: null, isLoading: false });
    useDebouncedSalesOrderStockCheckMock.mockReturnValue({ data: [], isLoading: false });
    useCreateSalesOrderDraftMock.mockReturnValue({
      isPending: false,
      mutate: (_input: unknown, options: { onSuccess: (payload: { data: SalesOrderComposerDocument }) => void }) => {
        options.onSuccess({ data: baseDocument() });
      },
    });
    useSalesOrderComposerMock.mockImplementation((id: string | null) => ({
      data: id ? baseDocument() : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));
  });

  it('renders expected delivery and confirm order on new sales order', async () => {
    renderComposer({ mode: 'create' });

    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    expect(screen.getByText('Expected delivery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm order/i })).toBeDisabled();
  });

  it('shows stock warning and swaps footer CTA to confirm with backorder', async () => {
    useBuyerSalesOrderContextMock.mockImplementation((buyerId: string | null) => ({
      data: buyerId ? baseBuyer() : null,
      isLoading: false,
    }));
    useSalesOrderProductSearchMock.mockImplementation((query: string) => ({
      data: query ? [searchRow] : [],
      isLoading: false,
    }));

    renderComposer({ mode: 'create' });

    fireEvent.click(await screen.findByRole('button', { name: /Acme Retail/i }));
    await screen.findByText(/Credit headroom/i);
    fireEvent.change(screen.getByPlaceholderText(/Search product/i), { target: { value: 'Shiraz' } });
    fireEvent.click(await screen.findByRole('button', { name: /Vinikus Shiraz Reserve/i }));
    const incrementButtons = screen.getAllByRole('button');
    const plusButton = incrementButtons.find((button) => button.querySelector('.lucide-plus'));
    expect(plusButton).toBeTruthy();
    fireEvent.click(plusButton!);
    fireEvent.click(plusButton!);

    await waitFor(() => {
      expect(screen.getByText(/1 line\(s\) over stock/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm with backorder/i })).toBeEnabled();
      expect(screen.queryByRole('button', { name: /^Confirm order$/i })).not.toBeInTheDocument();
    });
  });

  it('shows from-estimate subtitle when prefilled from estimate', async () => {
    useCreateSalesOrderDraftMock.mockReturnValue({
      isPending: false,
      mutate: (_input: unknown, options: { onSuccess: (payload: { data: SalesOrderComposerDocument }) => void }) => {
        options.onSuccess({
          data: baseDocument({
            buyer_id: 'buyer-1',
            source_estimate_number: 'EST-2026-00021',
            buyer_context: baseBuyer(),
          }),
        });
      },
    });
    useSalesOrderComposerMock.mockImplementation((id: string | null) => ({
      data: id
        ? baseDocument({
            buyer_id: 'buyer-1',
            source_estimate_number: 'EST-2026-00021',
            buyer_context: baseBuyer(),
          })
        : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));

    renderComposer({ mode: 'create', fromEstimateId: 'est-1' });

    expect(await screen.findByText(/Pre-filled from EST-2026-00021/i)).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /Swap/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
  });
});
