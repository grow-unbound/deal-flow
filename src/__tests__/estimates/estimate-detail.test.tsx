import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const pushMock = vi.fn();
const useEstimateDetailMock = vi.fn();
const useConvertMock = vi.fn();
const useConvertInvoiceMock = vi.fn();
const useEstimateProductSearchMock = vi.fn();
const useVoidMock = vi.fn();
const useDupMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateFlagsMock = vi.fn();
const seedEstimateComposerCacheMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/estimates/est-1',
}));

vi.mock('@/hooks/useEstimates', () => ({
  useEstimateDetail: (...args: unknown[]) => useEstimateDetailMock(...args),
  useConvertEstimateToOrder: (...args: unknown[]) => useConvertMock(...args),
  useConvertEstimateToInvoice: (...args: unknown[]) => useConvertInvoiceMock(...args),
  useEstimateProductSearch: (...args: unknown[]) => useEstimateProductSearchMock(...args),
  useVoidEstimate: (...args: unknown[]) => useVoidMock(...args),
  useDuplicateEstimate: (...args: unknown[]) => useDupMock(...args),
  useSendEstimateDetailWhatsApp: () => ({ mutate: vi.fn(), isPending: false }),
  seedEstimateComposerCache: (...args: unknown[]) => seedEstimateComposerCacheMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useCreateFlags', () => ({
  useCreateFlags: (...args: unknown[]) => useCreateFlagsMock(...args),
}));

vi.mock('@/hooks/useTenantSettings', () => ({
  useTenantSettings: () => ({
    data: { modules: { business_policy: { credit_enabled: true, gst_inclusive: false, gst_rate: 18 } } },
    isLoading: false,
    isError: false,
    error: null,
    save: vi.fn(),
    isSaving: false,
  }),
}));

vi.mock('@/hooks/useBusinessPolicy', () => ({
  useBusinessPolicy: () => ({ creditEnabled: true, gstInclusive: false, gstRate: 18 }),
}));

import type { ReactElement } from 'react';
import type { TenantEstimateDetailResponse } from '@/types/tenant-estimate-detail';
import { ROLES } from '@/constants';
import { EstimateDetailPage } from '@/components/seller/estimates/detail/EstimateDetailPage';

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function basePayload(overrides: Partial<TenantEstimateDetailResponse> = {}): TenantEstimateDetailResponse {
  const now = Date.now();
  const dateIssued = new Date(now - 2 * DAY_MS).toISOString().slice(0, 10);
  const validUntil = new Date(now + 20 * DAY_MS).toISOString().slice(0, 10);
  return {
    id: 'est-1',
    estimate_number: 'EST-2026-0001',
    status: 'draft',
    status_label: 'Draft',
    status_tone: 'neutral',
    buyer: {
      id: 'buyer-1',
      name: 'Acme Stores',
      payment_terms_days: 15,
      credit_limit: 100_000,
    },
    subtotal: 10_000,
    tax_amount: 1800,
    total_amount: 11_800,
    currency: 'INR',
    notes: null,
    expires_at: new Date(now + 20 * DAY_MS).toISOString(),
    created_at: new Date(now - 2 * DAY_MS).toISOString(),
    sent_at: null,
    accepted_at: null,
    viewed_at: null,
    viewed_by_name: null,
    voided_at: null,
    estimate_version: 1,
    converted_to_order_id: null,
    converted_to_invoice_id: null,
    linked_order_number: null,
    linked_invoice_number: null,
    items: [
      {
        id: 'li-1',
        tenant_product_id: 'tp-1',
        product_name: 'Widget',
        sku: 'WX-1',
        brand_name: 'BrandX',
        brand_initials: 'BR',
        brand_hue: 'teal',
        hsn_code: null,
        on_hand: 100,
        qty: 2,
        unit_price: 5000,
        mrp: 0,
        base_selling_price: 5000,
        disc_pct: 0,
        tax_pct: 18,
        line_total: 11_800,
        scheme_tag: null,
      },
    ],
    credit_used: 20_000,
    credit_available: 80_000,
    activity: [],
    viewer_role: ROLES.SELLER_ADMIN,
    buyer_id: 'buyer-1',
    location_id: 'loc-1',
    location_name: 'Main warehouse',
    available_locations: [{ id: 'loc-1', name: 'Main warehouse', is_default: true }],
    estimate_date: dateIssued,
    valid_until: validUntil,
    buyer_po_ref: '',
    place_of_supply: 'Karnataka',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_channel: null,
    buyer_context: {
      id: 'buyer-1',
      business_name: 'Acme Stores',
      contact_name: null,
      phone: null,
      email: null,
      gstin: null,
      bill_address: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: null,
      place_of_supply: 'Karnataka',
      seller_state: 'Karnataka',
      payment_terms_days: 15,
      credit_limit: 100_000,
      credit_used: 20_000,
      credit_available: 80_000,
      active_pricelist: null,
      sales_agent_name: null,
    },
    whatsapp_send: {
      can_send: true,
      block_reason: null,
      block_message: null,
      credits_balance: 10,
      required_credits: 1,
      recipient_phone: '9876543210',
      template_name: 'request_update_buyer',
      seller_name: 'Yukti Seller',
      seller_phone_display: '+91 98765 43210',
    },
    ...overrides,
  };
}

describe('EstimateDetailPage (EP-17-004 composer view)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    pushMock.mockReset();
    seedEstimateComposerCacheMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
    useCreateFlagsMock.mockReturnValue({ createSalesOrders: true, createInvoices: true, createEstimates: true });
    useConvertMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useConvertInvoiceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useEstimateProductSearchMock.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    useVoidMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useDupMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useEstimateDetailMock.mockReturnValue({
      data: basePayload(),
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('draft shows title status chip', () => {
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(document.querySelector('.doc-status-chip')).toHaveTextContent(/Draft/i);
    expect(screen.queryByRole('button', { name: /convert to so/i })).toBeNull();
  });

  it('sent shows Sent chip in title row', () => {
    useEstimateDetailMock.mockReturnValue({
      data: basePayload({
        status: 'sent',
        status_label: 'Sent',
        status_tone: 'warning',
        sent_at: '2026-06-05T10:00:00.000Z',
        viewed_at: '2026-06-05T11:00:00.000Z',
        viewed_by_name: 'Priya',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(document.querySelector('.doc-status-chip')).toHaveTextContent(/Sent/i);
  });

  it('view frame keeps inputs disabled or read-only', () => {
    const { container } = renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    const frame = container.querySelector('.doc-readonly');
    expect(frame).toBeTruthy();
    const bad = frame?.querySelectorAll('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
    expect(bad?.length ?? 0).toBe(0);
  });

  it('shows Edit for sent and hides Edit for converted', () => {
    useEstimateDetailMock.mockReturnValue({
      data: basePayload({
        status: 'sent',
        sent_at: '2026-06-05T10:00:00.000Z',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { unmount } = renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.getByRole('button', { name: /edit estimate/i })).toBeInTheDocument();
    unmount();

    useEstimateDetailMock.mockReturnValue({
      data: basePayload({
        status: 'converted',
        status_label: 'Converted',
        converted_to_order_id: 'ord-1',
        linked_order_number: 'SO-1',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.queryByRole('button', { name: /edit estimate/i })).toBeNull();
  });

  it('Edit navigates to edit route and seeds composer cache', () => {
    useEstimateDetailMock.mockReturnValue({
      data: basePayload({ status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    fireEvent.click(screen.getByRole('button', { name: /edit estimate/i }));
    expect(seedEstimateComposerCacheMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/estimates/est-1/edit');
  });

  it('draft title action shows Send estimate outline button', () => {
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.getByRole('button', { name: /send estimate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit estimate/i })).toBeInTheDocument();
  });

  it('Convert appears only for sent and opens modal', async () => {
    useEstimateDetailMock.mockReturnValue({
      data: basePayload({ status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    fireEvent.click(screen.getByRole('button', { name: /convert estimate/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/convert estimate/i)).toBeInTheDocument();
  });

  it('hides void for seller_assistant', () => {
    useEstimateDetailMock.mockReturnValue({
      data: basePayload({
        status: 'sent',
        sent_at: '2026-06-05T10:00:00.000Z',
        viewer_role: ROLES.SELLER_ASSISTANT,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.queryByRole('button', { name: /void estimate/i })).toBeNull();
  });

  it('shows FeatureDisabledState when estimates flag is off', () => {
    useFlagStateMock.mockImplementation((flag: string) => (flag === 'ESTIMATES' ? false : true));
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.getByRole('heading', { name: /enabled yet/i })).toBeInTheDocument();
  });

  it('shows FeatureDisabledState on forbidden estimate fetch', () => {
    useEstimateDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('forbidden'),
    });
    renderWithQueryClient(<EstimateDetailPage id="est-1" />);
    expect(screen.getByRole('heading', { name: /no access/i })).toBeInTheDocument();
  });
});
