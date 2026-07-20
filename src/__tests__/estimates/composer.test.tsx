import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocComposerEstimate } from '@/components/seller/estimates/DocComposerEstimate';
import type { EstimateComposerBuyerContext, EstimateComposerDocument, EstimateComposerProductSearchRow } from '@/types/estimate-composer';

const pushMock = vi.fn();
const useFlagStateMock = vi.fn();
const useEstimateComposerMock = vi.fn();
const useSaveEstimateComposerMock = vi.fn();
const useBuyerEstimateContextMock = vi.fn();
const useEstimatePriceListOptionsMock = vi.fn();
const useEstimateProductPricingMock = vi.fn();
const useEstimateProductSearchMock = vi.fn();
const useNextEstimateNumberMock = vi.fn();
const useTenantLocationsMock = vi.fn();
const apiFetchMock = vi.fn();
const apiPatchMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useTenantLocations', () => ({
  useTenantLocations: (...args: unknown[]) => useTenantLocationsMock(...args),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'seller@example.com',
      displayName: 'Phani',
    },
  }),
}));

vi.mock('@/hooks/useEstimates', () => ({
  useEstimateComposer: (...args: unknown[]) => useEstimateComposerMock(...args),
  useSaveEstimateComposer: (...args: unknown[]) => useSaveEstimateComposerMock(...args),
  useBuyerEstimateContext: (...args: unknown[]) => useBuyerEstimateContextMock(...args),
  useBuyerDocumentSendState: () => ({
    data: {
      can_send: true,
      block_reason: null,
      block_message: null,
      credits_balance: 10,
      required_credits: 1,
      recipient_phone: '9999999999',
      template_name: 'request_update_buyer',
      seller_name: 'Yukti Seller',
      seller_phone_display: '+91 98765 43210',
    },
    isLoading: false,
  }),
  useEstimatePriceListOptions: (...args: unknown[]) => useEstimatePriceListOptionsMock(...args),
  useEstimateProductPricing: (...args: unknown[]) => useEstimateProductPricingMock(...args),
  useEstimateProductSearch: (...args: unknown[]) => useEstimateProductSearchMock(...args),
  useNextEstimateNumber: (...args: unknown[]) => useNextEstimateNumberMock(...args),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => {
  class QueryMock {
    select() {
      return this;
    }
    eq() {
      return this;
    }
    ilike() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
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

function baseBuyer(overrides: Partial<EstimateComposerBuyerContext> = {}): EstimateComposerBuyerContext {
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

function baseDocument(overrides: Partial<EstimateComposerDocument> = {}): EstimateComposerDocument {
  const base: EstimateComposerDocument = {
    id: 'est-1',
    estimate_number: 'EST-2026-00001',
    status: 'draft',
    buyer_id: null,
    location_id: null,
    location_name: null,
    available_locations: [],
    estimate_date: '2026-06-07',
    valid_until: '2026-06-21',
    buyer_po_ref: '',
    place_of_supply: '',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_at: null,
    sent_channel: null,
    items: [],
    buyer_context: null,
    estimate_version: 1,
    viewed_at: null,
    viewed_by_name: null,
    voided_at: null,
    converted_to_order_id: null,
    linked_order_number: null,
  };
  return { ...base, ...overrides, estimate_version: overrides.estimate_version ?? base.estimate_version };
}

const searchRow: EstimateComposerProductSearchRow = {
  tenant_product_id: 'tp-1',
  product_name: 'Vinikus Shiraz Reserve',
  sku: 'SKU-001',
  brand_name: 'Vinikus',
  brand_initials: 'VI',
  brand_hue: 'teal',
  hsn_code: '2204',
  tax_pct: 18,
  on_hand: 24,
  unit_price: 1180,
  mrp: 1500,
  base_selling_price: 1180,
  default_uom: 'bottle',
  pack_size: 750,
};

function renderComposer(props: React.ComponentProps<typeof DocComposerEstimate>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocComposerEstimate {...props} />
    </QueryClientProvider>,
  );
}

describe('DocComposerEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/tenant/buyers/search')) {
        return {
          ok: true,
          json: async () => ({
            buyers: [
              {
                id: 'buyer-1',
                business_name: 'Acme Retail',
                place_of_supply: 'Delhi',
              },
            ],
          }),
        };
      }
      if (url.includes('/api/tenant/estimates/next-number')) {
        return {
          ok: true,
          json: async () => ({ estimate_number: 'EST-2026-00001' }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });
    apiPatchMock.mockResolvedValue({ ok: true, json: async () => ({ data: baseDocument() }) });
    apiPostMock.mockResolvedValue({ ok: true, json: async () => ({ data: baseDocument() }) });
    useFlagStateMock.mockReturnValue(true);
    useSaveEstimateComposerMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useEstimatePriceListOptionsMock.mockReturnValue({
      data: [{ id: 'pl-1', name: 'North Delhi A-class' }],
      isLoading: false,
    });
    useEstimateProductPricingMock.mockReturnValue({ data: {}, isLoading: false });
    useEstimateProductSearchMock.mockReturnValue({ data: [], isLoading: false });
    useNextEstimateNumberMock.mockReturnValue({ data: 'EST-2026-00001', isLoading: false });
    useTenantLocationsMock.mockReturnValue({
      data: {
        locations: [
          { id: 'loc-1', name: 'Main warehouse', is_default: true, deleted_at: null },
          { id: 'loc-2', name: 'North depot', is_default: false, deleted_at: null },
        ],
      },
      isLoading: false,
    });
    useBuyerEstimateContextMock.mockReturnValue({ data: null, isLoading: false });
    useEstimateComposerMock.mockImplementation((id: string | null) => ({
      data: id ? baseDocument() : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));
  });

  it('renders buyer-empty state with disabled send CTA on new estimate', async () => {
    renderComposer({ mode: 'create' });

    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send estimate/i })).toBeDisabled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('shows the IST create date and loads location options', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T20:30:00.000Z'));

    try {
      renderComposer({ mode: 'create' });

      expect(screen.getByText('01/07/2026')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Main warehouse')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows matching products in the search dropdown', async () => {
    useBuyerEstimateContextMock.mockImplementation((buyerId: string | null) => ({
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
    expect(await screen.findByRole('option', { name: /Vinikus Shiraz Reserve/i })).toBeInTheDocument();
  });

  it('shows a search loader while product results are still loading', async () => {
    useBuyerEstimateContextMock.mockImplementation((buyerId: string | null) => ({
      data: buyerId ? baseBuyer() : null,
      isLoading: false,
    }));
    useEstimateProductSearchMock.mockReturnValue({
      data: [],
      isLoading: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    });

    renderComposer({ mode: 'create' });

    fireEvent.focus(screen.getByPlaceholderText(/Search buyer/i));
    fireEvent.click(await screen.findByRole('button', { name: /Acme Retail/i }, { timeout: 8000 }));
    await screen.findByText(/Credit headroom/i);

    fireEvent.change(screen.getByPlaceholderText(/Search product/i), { target: { value: 'Shi' } });
    expect(await screen.findByText(/Searching products/i)).toBeInTheDocument();
  });

  it('hydrates buyer card and over-limit warning after buyer + line selection', async () => {
    useBuyerEstimateContextMock.mockImplementation((buyerId: string | null) => ({
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
    expect(screen.getByText(/North Delhi A-class/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search product/i), { target: { value: 'Shiraz' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Search product/i), { key: 'Enter' });

    await waitFor(
      () => {
        expect(screen.getByText(/Over limit by/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Send estimate/i })).toBeEnabled();
        expect(screen.getAllByText(/₹1,392/i).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('1')).toHaveFocus();
      },
      { timeout: 12_000 },
    );
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Price/Unit')).toBeInTheDocument();
    expect(screen.getByText(/Base Price ₹1,180/i)).toBeInTheDocument();
    expect(screen.queryByText(/HSN/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Disc %')).not.toBeInTheDocument();
    expect(screen.queryByText(/Resolved price check/i)).not.toBeInTheDocument();
  }, 15_000);

  it('shows edit mode chip and save & resend CTA for sent estimates', async () => {
    useEstimateComposerMock.mockReturnValue({
      data: baseDocument({
        id: 'est-2',
        status: 'sent',
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

    renderComposer({ mode: 'edit', estimateId: 'est-2' });

    expect(await screen.findByText(/Editing live draft/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & resend/i })).toBeInTheDocument();
  });

  it('keeps location editable in edit mode when multiple locations are available', async () => {
    useEstimateComposerMock.mockReturnValue({
      data: baseDocument({
        id: 'est-3',
        buyer_id: 'buyer-1',
        location_id: 'loc-2',
        location_name: 'Pune Depot',
        available_locations: [
          { id: 'loc-1', name: 'Mumbai HQ', is_default: true },
          { id: 'loc-2', name: 'Pune Depot', is_default: false },
        ],
        buyer_context: baseBuyer({ credit_limit: 20_000, credit_used: 2000, credit_available: 18_000 }),
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    renderComposer({ mode: 'edit', estimateId: 'est-3' });

    expect((await screen.findAllByRole('combobox')).length).toBeGreaterThan(1);
    expect(screen.getByText('Pune Depot')).toBeInTheDocument();
  });
});
