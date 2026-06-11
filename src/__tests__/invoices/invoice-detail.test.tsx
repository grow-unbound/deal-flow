import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const pushMock = vi.fn();
const useInvoiceDetailMock = vi.fn();
const payMutateAsync = vi.fn().mockResolvedValue({});
const voidMutateAsync = vi.fn().mockResolvedValue({});
const remindMutateAsync = vi.fn().mockResolvedValue({});
const sendInvoiceMutate = vi.fn();
const useFlagStateMock = vi.fn();
const prefetchInvoiceComposerMock = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/invoices/inv-1',
}));

vi.mock('@/hooks/useInvoices', () => ({
  prefetchInvoiceComposer: (...args: unknown[]) => prefetchInvoiceComposerMock(...args),
}));

vi.mock('@/hooks/useInvoiceDetail', () => ({
  useInvoiceDetail: (...args: unknown[]) => useInvoiceDetailMock(...args),
  useMarkInvoicePaid: () => ({ mutateAsync: payMutateAsync, isPending: false }),
  useVoidInvoice: () => ({ mutateAsync: voidMutateAsync, isPending: false }),
  useSendInvoiceReminder: () => ({ mutateAsync: remindMutateAsync, isPending: false }),
  useSendInvoice: () => ({ mutate: sendInvoiceMutate, isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { InvoiceDetailResponse } from '@/types/tenant-invoices';
import { InvoiceDetailPage } from '@/components/seller/invoices/detail/InvoiceDetailPage';

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function baseInvoice(overrides: Partial<InvoiceDetailResponse> = {}): InvoiceDetailResponse {
  return {
    id: 'inv-1',
    doc_number: 'INV-100',
    db_status: 'draft',
    status: 'draft',
    version: 1,
    invoice_date: '2026-06-01',
    due_date: '2026-06-20',
    sent_at: null,
    viewed_at: null,
    viewed_by_name: null,
    paid_at: null,
    payment_method: null,
    payment_reference: null,
    amount_outstanding: 11_800,
    amount_paid: 0,
    voided_at: null,
    last_reminder_at: null,
    gstin_locked: true,
    hsn_locked: true,
    place_of_supply: 'Karnataka',
    buyer_po_ref: 'PO-1',
    intra_state_tax: true,
    buyer_id: 'buyer-1',
    buyer: {
      id: 'buyer-1',
      name: 'Acme Stores',
      gstin: '29ABCDE1234F1Z5',
      gstin_state_code: '29',
      city: 'Bengaluru',
      credit_limit: 100_000,
      credit_used: 5000,
      payment_terms_days: 15,
      contact_name: null,
      phone: null,
      email: null,
      bill_address: 'MG Road',
      state: 'Karnataka',
      pincode: null,
      place_of_supply: 'Karnataka',
      seller_state: 'Karnataka',
      active_pricelist: null,
      sales_agent_name: null,
    },
    items: [
      {
        tenant_product_id: 'tp-1',
        product_name: 'Widget',
        sku: 'WDG-01',
        brand_name: 'Vinikus',
        brand_initials: 'VI',
        brand_hue: 'teal',
        hsn: '1234',
        qty: 2,
        unit: 'Nos',
        rate: 5000,
        mrp: 5500,
        discount_pct: 0,
        line_total: 10_000,
        tax_pct: 18,
      },
    ],
    totals: {
      subtotal: 10_000,
      discount_amt: 0,
      taxable: 10_000,
      tax_amount: 1800,
      freight: 0,
      round_off: 0,
      grand_total: 11_800,
      gst_rows: [
        { label: 'CGST 9%', rate_pct: 9, amount: 900, token: 'cgst' },
        { label: 'SGST 9%', rate_pct: 9, amount: 900, token: 'sgst' },
      ],
    },
    order_id: null,
    estimate_id: null,
    linked_order_number: null,
    linked_estimate_number: null,
    viewer_role: 'seller_admin',
    seller_note: '',
    payments: [],
    ...overrides,
  };
}

describe('InvoiceDetailPage (EP-17-006)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-07T12:00:00.000Z'));
    pushMock.mockReset();
    payMutateAsync.mockClear();
    voidMutateAsync.mockClear();
    remindMutateAsync.mockClear();
    sendInvoiceMutate.mockReset();
    prefetchInvoiceComposerMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice(),
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('draft shows title chip and primary actions', () => {
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(document.querySelector('.doc-status-chip')).toHaveTextContent(/Draft/i);
    expect(screen.getByRole('button', { name: /^send invoice$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit before send/i })).toBeInTheDocument();
  });

  it('sent shows Sent chip and payment actions', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'sent',
        status: 'sent',
        sent_at: '2026-06-06T10:00:00.000Z',
        due_date: '2026-06-12',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(document.querySelector('.doc-status-chip')).toHaveTextContent(/Sent/i);
    expect(screen.getByRole('button', { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reminder/i })).toBeInTheDocument();
  });

  it('overdue shows Overdue chip and Edit remains', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'sent',
        status: 'overdue',
        sent_at: '2026-06-01T10:00:00.000Z',
        due_date: '2026-06-01',
        amount_outstanding: 11_800,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(document.querySelector('.doc-status-chip')).toHaveTextContent(/Overdue/i);
    expect(screen.getByRole('button', { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit (before send|invoice)/i })).toBeInTheDocument();
  });

  it('hides Edit for paid and void', () => {
    const { unmount } = renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    unmount();
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ db_status: 'paid', status: 'paid', paid_at: '2026-06-10T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { unmount: u2 } = renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.queryByRole('button', { name: /edit (before send|invoice)/i })).toBeNull();
    u2();
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ db_status: 'void', status: 'void', voided_at: '2026-06-10T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.queryByRole('button', { name: /edit (before send|invoice)/i })).toBeNull();
  });

  it('shows version badge when version > 1', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ version: 2, db_status: 'sent', status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('renders brand avatar initials on line rows', () => {
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.getByLabelText('VI')).toBeInTheDocument();
  });

  it('renders GST split rows with tax-row classes when gstin_locked', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ db_status: 'sent', status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const { container } = renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(container.querySelector('.tax-row--cgst')).toBeTruthy();
    expect(container.querySelector('.tax-row--sgst')).toBeTruthy();
  });

  it('view frame keeps inputs disabled or read-only', () => {
    const { container } = renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    const frame = container.querySelector('.doc-readonly');
    expect(frame).toBeTruthy();
    const bad = frame?.querySelectorAll('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
    expect(bad?.length ?? 0).toBe(0);
  });

  it('shows payments card with due amount for sent invoices', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'sent',
        status: 'sent',
        sent_at: '2026-06-05T10:00:00.000Z',
        amount_outstanding: 11_800,
        payments: [
          {
            id: 'pay-1',
            amount: 5000,
            paid_at: '2026-06-06T10:00:00.000Z',
            payment_method: 'UPI',
            payment_reference: 'ref-1',
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText(/ref-1/i)).toBeInTheDocument();
    expect(screen.getByText('Amount due')).toBeInTheDocument();
  });

  it('shows no dues when outstanding is zero', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'paid',
        status: 'paid',
        paid_at: '2026-06-10T10:00:00.000Z',
        amount_outstanding: 0,
        amount_paid: 11_800,
        payments: [
          {
            id: 'pay-1',
            amount: 11_800,
            paid_at: '2026-06-10T10:00:00.000Z',
            payment_method: 'Bank transfer',
            payment_reference: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.getByText('No dues')).toBeInTheDocument();
    expect(screen.queryByText('Over limit.')).toBeNull();
  });

  it('shows warning when payment exceeds amount due', async () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'sent',
        status: 'sent',
        sent_at: '2026-06-05T10:00:00.000Z',
        amount_outstanding: 11_800,
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));
    const dialog = await screen.findByRole('dialog');
    const amt = within(dialog).getByLabelText(/^amount$/i);
    fireEvent.change(amt, { target: { value: '15,000' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/exceeds amount due/i);
    expect(within(dialog).getByRole('button', { name: /record payment/i })).toBeDisabled();
  });

  it('opens mark paid modal with full amount shortcut', async () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ db_status: 'sent', status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    const amt = within(dialog).getByDisplayValue('11,800');
    expect((amt as HTMLInputElement).value).toBe('11,800');
    fireEvent.click(within(dialog).getByRole('button', { name: /full amount/i }));
    expect((amt as HTMLInputElement).value).toBe('11,800');
  }, 15_000);

  it('send reminder modal pre-fills message', async () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({ db_status: 'sent', status: 'sent', sent_at: '2026-06-05T10:00:00.000Z' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    fireEvent.click(screen.getByRole('button', { name: /send reminder/i }));
    const dialog = await screen.findByRole('dialog');
    const ta = within(dialog).getByRole('textbox');
    expect((ta as HTMLTextAreaElement).value).toContain('INV-100');
  });

  it('hides void for seller_assistant', () => {
    useInvoiceDetailMock.mockReturnValue({
      data: baseInvoice({
        db_status: 'sent',
        status: 'sent',
        sent_at: '2026-06-05T10:00:00.000Z',
        viewer_role: 'seller_assistant',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.queryByRole('button', { name: /void invoice/i })).toBeNull();
  });

  it('edit before send prefetches composer then navigates', () => {
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    fireEvent.click(screen.getByRole('button', { name: /edit before send/i }));
    expect(prefetchInvoiceComposerMock).toHaveBeenCalledWith(expect.anything(), 'inv-1');
    expect(pushMock).toHaveBeenCalledWith('/invoices/inv-1/edit');
  });

  it('shows FeatureDisabledState when invoices flag is off', () => {
    useFlagStateMock.mockImplementation((flag: string) => (flag === 'INVOICES' ? false : true));
    renderWithQueryClient(<InvoiceDetailPage id="inv-1" />);
    expect(screen.getByRole('heading', { name: /enabled yet/i })).toBeInTheDocument();
  });
});
