import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const pushMock = vi.fn();
const useSalesOrderDetailMock = vi.fn();
const useDispatchMock = vi.fn();
const useDeliverMock = vi.fn();
const useCancelMock = vi.fn();
const useFlagStateMock = vi.fn();
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
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

import type { SalesOrderDetail } from '@/types/tenant-sales-orders';
import { ROLES } from '@/constants';
import { SalesOrderDetailClient } from '@/components/seller/sales-orders/detail/SalesOrderDetailClient';

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
    ...overrides,
  };
}

describe('SalesOrderDetailClient (EP-17-005 composer view)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    pushMock.mockReset();
    prefetchSalesOrderComposerMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
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

  it('received: status band shows Received chip', () => {
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    const band = container.querySelector('.doc-status-band');
    expect(band).toBeTruthy();
    expect(band).toHaveTextContent(/Received/i);
  });

  it('confirmed: band shows delivery expected when expected_delivery set', () => {
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
    const band = container.querySelector('.doc-status-band');
    expect(band).toHaveTextContent(/Confirmed/i);
    expect(band).toHaveTextContent(/Delivery expected/i);
  });

  it('dispatched: band mentions carrier when present', () => {
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
    const band = container.querySelector('.doc-status-band');
    expect(band).toHaveTextContent(/BlueDart/i);
  });

  it('view frame keeps inputs disabled or read-only', () => {
    const { container } = renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    const frame = container.querySelector('.doc-readonly');
    expect(frame).toBeTruthy();
    const bad = frame?.querySelectorAll('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
    expect(bad?.length ?? 0).toBe(0);
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
    expect(screen.getByRole('button', { name: /Dispatch/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel order/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Cancel order/i })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /Cancel order/i })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Dispatch/i }));
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

  it('received shows sales order journey with Received step', () => {
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    expect(screen.getByLabelText('Sales order progress')).toHaveTextContent('Received');
  });

  it('Edit prefetches composer then navigates', () => {
    renderWithQueryClient(<SalesOrderDetailClient id="ord-1" />);
    fireEvent.click(screen.getByRole('button', { name: /edit order/i }));
    expect(prefetchSalesOrderComposerMock).toHaveBeenCalledWith(expect.anything(), 'ord-1');
    expect(pushMock).toHaveBeenCalledWith('/sales-orders/ord-1/edit');
  });
});
