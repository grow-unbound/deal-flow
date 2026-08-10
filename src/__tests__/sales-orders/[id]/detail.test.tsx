import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const pushMock = vi.fn();
const useSalesOrderDetailMock = vi.fn();
const useDispatchMock = vi.fn();
const useDeliverMock = vi.fn();
const useCancelMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateFlagsMock = vi.fn();
const prefetchSalesOrderComposerMock = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/sales-orders/ord-1',
}));

vi.mock('@/hooks/useSalesOrders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSalesOrders')>();
  return {
    ...actual,
    prefetchSalesOrderComposer: (...args: unknown[]) => prefetchSalesOrderComposerMock(...args),
  };
});

vi.mock('@/hooks/useSalesOrderDetail', () => ({
  useSalesOrderDetail: (...args: unknown[]) => useSalesOrderDetailMock(...args),
  useDispatchSalesOrder: (...args: unknown[]) => useDispatchMock(...args),
  useDeliverSalesOrder: (...args: unknown[]) => useDeliverMock(...args),
  useCancelSalesOrder: (...args: unknown[]) => useCancelMock(...args),
  useConfirmSalesOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendSalesOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    currentTenantId: 'tenant-1',
    user: { id: 'user-1', email: 'seller@example.com', displayName: 'Phani' },
  }),
}));

import type { SalesOrderDetail } from '@/types/tenant-sales-orders';
import { ROLES } from '@/constants';
import { SalesOrderDetailClient } from '@/components/seller/sales-orders/detail/SalesOrderDetailClient';

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function openMoreActions() {
  fireEvent.click(screen.getByRole('button', { name: /More actions/i }));
}

const TP = '11111111-1111-4111-8111-111111111111';

function baseBuyerContext() {
  return {
    id: 'buyer-1',
    business_name: 'Acme Stores',
    contact_name: 'Ravi',
    phone: '9000000000',
    email: null,
    gstin: '29AAAAA0000A1Z5',
    bill_address: 'Bengaluru, KA',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    place_of_supply: 'Karnataka',
    seller_state: 'Karnataka',
    payment_terms_days: 15,
    credit_limit: 500_000,
    credit_used: 0,
    credit_available: 500_000,
    active_pricelist: null,
    sales_agent_name: null,
  };
}

function baseLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li-1',
    tenant_product_id: TP,
    name: 'Widget',
    brand: 'BrandX',
    brand_initials: 'BR',
    brand_hue: 'teal' as const,
    sku: 'WX-1',
    qty: 2,
    unit_price: 500,
    tax_rate: 18,
    tax_pct: 18,
    disc_pct: 0,
    hsn_code: '1234',
    unit: 'PCS',
    line_total: 1180,
    on_hand: 10,
    on_hand_at_confirm: 10,
    scheme_tag: null,
    ...overrides,
  };
}

function baseDetail(overrides: Partial<SalesOrderDetail> = {}): SalesOrderDetail {
  return {
    id: 'ord-1',
    order_number: 'DF-1001',
    location_id: 'loc-1',
    location_name: 'Mumbai HQ',
    db_status: 'received',
    ui_status: 'received',
    placed_at: '2026-05-10T10:00:00.000Z',
    source: 'buyer_app',
    catalog_name: 'Summer 2026',
    subtotal: 1000,
    tax_amount: 180,
    total_amount: 1180,
    currency: 'INR',
    notes: 'Handle with care',
    cancel_reason: null,
    viewer_role: ROLES.SELLER_ADMIN,
    buyer_context: baseBuyerContext(),
    discount_flat: 0,
    freight: 0,
    round_off: 0,
    has_backorder: false,
    expected_delivery: '2026-06-15',
    buyer_po_ref: 'PO-9',
    place_of_supply: 'Karnataka',
    seller_note: '',
    received_at: '2026-05-10T10:00:00.000Z',
    confirmed_at: null,
    dispatched_at: null,
    delivered_at: null,
    cancelled_at: null,
    carrier: null,
    dispatch_notes: null,
    buyer: {
      id: 'buyer-1',
      name: 'Acme Stores',
      city: 'Bengaluru',
      state: 'KA',
      gstin: '29AAAAA0000A1Z5',
      credit_limit: 500_000,
      payment_terms_days: 15,
      contact_name: 'Ravi',
      phone: '9000000000',
      geography: { city: 'Bengaluru', state: 'KA' },
    },
    lines: [baseLine()],
    invoice: null,
    estimate: null,
    activity: [] as SalesOrderDetail['activity'],
    stepper_timestamps: {},
    is_buyer_app: true,
    ...overrides,
  };
}

describe('SalesOrderDetailClient (EP-17-005 composer view)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    pushMock.mockReset();
    prefetchSalesOrderComposerMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
    useCreateFlagsMock.mockReturnValue({ createSalesOrders: true, createInvoices: true });
    useDispatchMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useDeliverMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useCancelMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail(),
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('received: title shows Received chip', () => {
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(container.querySelector('.doc-status-chip')).toHaveTextContent(/Received/i);
    expect(screen.queryByRole('tab', { name: /Activity/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Buyer App Sales Order')).toBeInTheDocument();
  });

  it('confirmed: title shows Confirmed chip and Dispatch CTA', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        ui_status: 'confirmed',
        db_status: 'confirmed',
        confirmed_at: '2026-05-11T08:00:00.000Z',
        expected_delivery: '2026-06-20',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(container.querySelector('.doc-status-chip')).toHaveTextContent(/Confirmed/i);
    openMoreActions();
    expect(screen.getByText(/Dispatch/i)).toBeInTheDocument();
  });

  it('dispatched: title shows Dispatched chip and Mark delivered', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        ui_status: 'dispatched',
        db_status: 'dispatched',
        dispatched_at: '2026-05-12T09:00:00.000Z',
        carrier: 'BlueDart',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(container.querySelector('.doc-status-chip')).toHaveTextContent(/Dispatched/i);
    expect(screen.getByRole('button', { name: /Mark delivered/i })).toBeInTheDocument();
  });

  it('view frame keeps inputs disabled or read-only', () => {
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    const frame = container.querySelector('.doc-readonly');
    expect(frame).toBeTruthy();
    const bad = frame?.querySelectorAll('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
    expect(bad?.length ?? 0).toBe(0);
  });

  it('renders refreshed readonly customer strip, subtitle, and stock warning', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        buyer_context: {
          ...baseBuyerContext(),
          active_pricelist: { id: 'pl-1', name: 'Retail Platinum' },
        },
        lines: [baseLine({ qty: 3, on_hand: 0 })],
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    const frame = container.querySelector('.doc-readonly');
    expect(frame).toBeTruthy();
    const readonly = within(frame as HTMLElement);

    expect(readonly.getByText(/Branch: Mumbai HQ/i)).toBeInTheDocument();
    expect(readonly.queryByText(/Bill to/i)).not.toBeInTheDocument();
    expect(readonly.getByText(/Place of supply/i)).toBeInTheDocument();
    expect(readonly.getByText(/Karnataka/i)).toBeInTheDocument();
    expect(readonly.queryByText(/Notes/i)).not.toBeInTheDocument();
    expect(readonly.queryByText(/Freight charges/i)).not.toBeInTheDocument();
    expect(readonly.getByText('29AAAAA0000A1Z5')).toBeInTheDocument();
    expect(readonly.getByText(/15 days/i)).toBeInTheDocument();
    expect(readonly.getByText(/Retail Platinum/i)).toBeInTheDocument();
    expect(readonly.getByText(/Credit headroom/i)).toBeInTheDocument();
    expect(readonly.getByText(/₹0 utilized of ₹5,00,000 limit/i)).toBeInTheDocument();
    expect(readonly.getByText(/1 item\. 3 units/i)).toBeInTheDocument();
    expect(readonly.queryByText(/Edit to make changes/i)).not.toBeInTheDocument();
    expect(readonly.getByText(/Out of stock/i)).toBeInTheDocument();
    expect(frame?.querySelector('.doc-line-stock-danger')).toBeTruthy();
  });

  it('confirmed shows Dispatch; assistant does not see Cancel', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        ui_status: 'confirmed',
        db_status: 'confirmed',
        viewer_role: ROLES.SELLER_ASSISTANT,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    openMoreActions();
    expect(screen.getByText(/Dispatch/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cancel order/i)).not.toBeInTheDocument();
  });

  it('admin confirmed shows Cancel order', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        ui_status: 'confirmed',
        db_status: 'confirmed',
        viewer_role: ROLES.SELLER_ADMIN,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    openMoreActions();
    expect(screen.getByText(/Cancel order/i)).toBeInTheDocument();
  });

  it('dispatched shows Mark delivered and hides Cancel', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({ ui_status: 'dispatched', db_status: 'dispatched' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(screen.getByRole('button', { name: /Mark delivered/i })).toBeInTheDocument();
    expect(screen.queryByText(/Cancel order/i)).not.toBeInTheDocument();
  });

  it('has_backorder callout on confirmed', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        ui_status: 'confirmed',
        db_status: 'confirmed',
        has_backorder: true,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(container.querySelector('.callout--warning')).toBeTruthy();
  });

  it('opens dispatch modal on Dispatch click', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({ ui_status: 'confirmed', db_status: 'confirmed' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    openMoreActions();
    fireEvent.click(screen.getByText(/Dispatch/i));
    expect(screen.getByText(/Confirm dispatch/i)).toBeInTheDocument();
  });

  it('renders estimate chip when estimate is set', () => {
    useSalesOrderDetailMock.mockReturnValue({
      data: baseDetail({
        estimate: { id: 'est-1', estimate_number: 'EST-88' },
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    const link = screen.getByRole('link', { name: /From: EST-88/i });
    expect(link).toHaveAttribute('href', '/estimates/est-1');
  });

  it('Edit prefetches composer then navigates', () => {
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    openMoreActions();
    fireEvent.click(screen.getByText(/edit order/i));
    expect(prefetchSalesOrderComposerMock).toHaveBeenCalledWith(expect.anything(), 'ord-1');
    expect(pushMock).toHaveBeenCalledWith('/sales-orders/ord-1/edit');
  });
});
