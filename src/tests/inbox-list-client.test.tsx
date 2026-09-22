import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useInboxEntriesMock = vi.fn();
const useParamsMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/hooks/useInboxEntries', () => ({
  useInboxEntries: (...args: unknown[]) => useInboxEntriesMock(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useParams: () => useParamsMock(),
}));

import { InboxListClient } from '@/components/seller/inbox/InboxListClient';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function mockMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
    buyer_phone: null, location_id: null, entry_type: 'invoice_overdue', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Ramesh Traders', summary: '₹22,000 · 16 days overdue', amount: 22000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-08-22T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: { aging_tier: '16-30d' }, allowed_actions: ['send_reminder'], time_bucket: 'today', customer_entry_count: 1,
  },
];

describe('InboxListClient', () => {
  beforeEach(() => {
    useInboxEntriesMock.mockReset();
    useParamsMock.mockReset();
    useParamsMock.mockReturnValue({ id: 'b1' });
    pushMock.mockReset();
    replaceMock.mockReset();
    window.localStorage?.clear?.();
    mockMedia(false);
  });

  it('renders date sections with customer rows', () => {
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<InboxListClient />);
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('1 invoice · ₹22,000 overdue')).toBeInTheDocument();
  });

  it('links the row to the buyer detail route', () => {
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<InboxListClient />);
    const link = screen.getByText('Ramesh Traders').closest('a');
    expect(link).toHaveAttribute('href', '/today/b1');
  });

  it('shows the empty state when there are no active entries', () => {
    useInboxEntriesMock.mockReturnValue({ data: { entries: [], nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<InboxListClient />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('shows an error state instead of the empty state when the fetch fails', () => {
    useInboxEntriesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithClient(<InboxListClient />);
    expect(screen.getByText(/couldn't load inbox/i)).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('keeps mobile on the entry list when landing on Today without a selected buyer', () => {
    useParamsMock.mockReturnValue({});
    mockMedia(false);
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<InboxListClient />);
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('opens the first buyer on desktop when landing on Today without a selected buyer', () => {
    useParamsMock.mockReturnValue({});
    mockMedia(true);
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<InboxListClient />);
    expect(replaceMock).toHaveBeenCalledWith('/today/b1');
  });
});
