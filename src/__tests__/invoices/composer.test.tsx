import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocComposerInvoice } from '@/components/seller/invoices/DocComposerInvoice';
import type { EstimateComposerLineRow } from '@/components/seller/document-composer';
import type { EstimateComposerBuyerContext } from '@/types/estimate-composer';
import type { InvoiceComposerDocument, InvoiceComposerProductSearchRow } from '@/types/invoice-composer';

const pushMock = vi.fn();
const useFlagStateMock = vi.fn();
const useInvoiceComposerMock = vi.fn();
const useSaveInvoiceComposerMock = vi.fn();
const useSendInvoiceMock = vi.fn();
const useNextInvoiceNumberMock = vi.fn();
const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useInvoices', () => ({
  useInvoiceComposer: (...args: unknown[]) => useInvoiceComposerMock(...args),
  useNextInvoiceNumber: (...args: unknown[]) => useNextInvoiceNumberMock(...args),
  useSaveInvoiceComposer: (...args: unknown[]) => useSaveInvoiceComposerMock(...args),
  useSendInvoice: (...args: unknown[]) => useSendInvoiceMock(...args),
}));

vi.mock('@/hooks/useEstimates', () => ({
  useBuyerEstimateContext: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@supabase/auth-helpers-nextjs', () => {
  class QueryMock {
    select() {
      return this;
    }
    eq() {
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

function baseDocument(overrides: Partial<InvoiceComposerDocument> = {}): InvoiceComposerDocument {
  return {
    id: 'inv-1',
    invoice_number: 'INV-100',
    status: 'draft',
    buyer_id: null,
    invoice_date: '2026-06-01',
    due_date: '2026-06-20',
    buyer_po_ref: '',
    place_of_supply: 'Unknown',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_at: null,
    sent_channel: null,
    items: [],
    buyer_context: null,
    order_id: null,
    estimate_id: null,
    linked_order_number: null,
    linked_estimate_number: null,
    ...overrides,
  };
}

const searchRow: InvoiceComposerProductSearchRow = {
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
  default_uom: 'bottle',
  pack_size: 750,
};

function renderComposer(props: React.ComponentProps<typeof DocComposerInvoice>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocComposerInvoice {...props} />
    </QueryClientProvider>,
  );
}

describe('DocComposerInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    global.fetch = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/api/tenant/products/search')) {
        return {
          ok: true,
          json: async () => ({ products: [searchRow] }),
        } as Response;
      }
      return { ok: true, json: async () => ({ products: [] }) } as Response;
    }) as typeof fetch;

    apiPostMock.mockResolvedValue({ ok: true, json: async () => ({ data: baseDocument() }) });
    apiPatchMock.mockResolvedValue({ ok: true, json: async () => ({ data: baseDocument() }) });

    useFlagStateMock.mockReturnValue(true);
    useSaveInvoiceComposerMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useSendInvoiceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useNextInvoiceNumberMock.mockReturnValue({ data: 'INV-100', isLoading: false });
    useInvoiceComposerMock.mockImplementation((id: string | null) => ({
      data: id ? baseDocument() : undefined,
      isLoading: false,
      isError: false,
      error: null,
    }));
  });

  it('does not POST invoice draft on mount for new invoice', async () => {
    renderComposer({ mode: 'create' });
    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('renders due date in basics strip and disabled send invoice on new invoice', async () => {
    renderComposer({ mode: 'create' });

    expect(await screen.findByPlaceholderText(/Search buyer/i)).toBeInTheDocument();
    const basicsStrip = document.querySelector('.doc-strip');
    expect(basicsStrip).toBeTruthy();
    expect(within(basicsStrip as HTMLElement).getByText('Invoice #')).toBeInTheDocument();
    expect(within(basicsStrip as HTMLElement).getByText('INV-100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send invoice/i })).toBeDisabled();
  });

  it('renders edit shell with preview PDF and save actions when lines exist', async () => {
    const line: EstimateComposerLineRow = {
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
      diff: 'clean',
    };

    useInvoiceComposerMock.mockReturnValue({
      data: baseDocument({
        buyer_id: 'buyer-1',
        buyer_context: baseBuyer({ credit_limit: 50_000, credit_used: 2000, credit_available: 48_000 }),
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

    renderComposer({ mode: 'edit', invoiceId: 'inv-1' });

    expect(await screen.findByText('Edit invoice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preview PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & close/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send invoice/i })).toBeEnabled();
    expect(screen.getByDisplayValue(String(line.qty))).toBeInTheDocument();
  });
});
