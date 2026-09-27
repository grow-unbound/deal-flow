import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const applyGenericMutateAsyncMock = vi.fn().mockResolvedValue({});
const applyApprovalMutateAsyncMock = vi.fn().mockResolvedValue({});

const retryMutateAsyncMock = vi.fn().mockResolvedValue({});
const roleState = { isSellerAdmin: true };

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAdmin: roleState.isSellerAdmin, isSellerAssistant: !roleState.isSellerAdmin }),
}));

vi.mock('@/hooks/useInboxEntries', () => ({
  useApplyGenericEntryAction: () => ({ mutateAsync: applyGenericMutateAsyncMock, isPending: false }),
  useApplyApprovalEntryAction: () => ({ mutateAsync: applyApprovalMutateAsyncMock, isPending: false }),
  useRetryZohoSync: () => ({ mutateAsync: retryMutateAsyncMock, isPending: false }),
  useApprovalAssignmentOptions: () => ({
    data: { cohorts: [], price_lists: [], default_cohort_id: null, zoho_active: false },
    isError: false,
  }),
  useApprovalPricePreview: () => ({ data: { headline: null, applicable: [] }, isPending: false }),
}));

import { InboxApprovalActionBar } from '@/components/seller/inbox/InboxApprovalActionBar';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const businessEntry: InboxEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
  buyer_phone: '9999999999', location_id: null, entry_type: 'business_approval', status: 'new',
  source_channel: 'buyer_app', source_entity_type: 'buyer', source_entity_id: 'b1',
  title: 'Sri Krishna Enterprises', summary: 'New business account', amount: null, currency: null,
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {}, allowed_actions: ['approve', 'request_more_info', 'decline', 'view_details', 'view_buyer', 'add_note'],
  time_bucket: 'today', customer_entry_count: 1,
};

const individualEntry: InboxEntry = { ...businessEntry, entry_type: 'new_user_login' };

const waitingEntry: InboxEntry = {
  ...businessEntry,
  status: 'waiting',
  metadata: { missing_fields: ['gst_certificate', 'address'] },
  allowed_actions: ['reopen', 'add_note', 'view_details', 'view_buyer'],
};

function renderBar(entry: InboxEntry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const applyLocalAction = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <InboxApprovalActionBar entry={entry} tenantId="t1" applyLocalAction={applyLocalAction} />
    </QueryClientProvider>,
  );
  return { applyLocalAction };
}

describe('InboxApprovalActionBar', () => {
  beforeEach(() => {
    applyGenericMutateAsyncMock.mockClear();
    applyApprovalMutateAsyncMock.mockClear();
    retryMutateAsyncMock.mockClear();
    roleState.isSellerAdmin = true;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('renders Approve / Request more info / Decline for a fresh business_approval entry', () => {
    renderBar(businessEntry);
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request info' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('Approve opens the confirmation dialog instead of approving immediately', () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));

    expect(applyApprovalMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer group')).toBeInTheDocument();
  });

  it('confirming in the dialog approves with the confirmed assignment and shows "Approved"', async () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm and approve' }));

    await waitFor(() =>
      expect(applyApprovalMutateAsyncMock).toHaveBeenCalledWith({
        entryId: 'e1',
        action: 'approve',
        cohort_id: null,
        price_list_id: null,
        assignment_confirmed: true,
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Approved/ })).toBeInTheDocument());
  });

  it('seller_assistant sees no approve / request info / decline controls', () => {
    roleState.isSellerAdmin = false;
    renderBar(businessEntry);

    expect(screen.queryByRole('button', { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('shows a failed Zoho sync with its error and lets an admin retry', () => {
    renderBar({
      ...businessEntry,
      status: 'resolved',
      external_sync_status: 'failed',
      external_sync_error: 'Zoho down',
      allowed_actions: ['reopen', 'view_details', 'view_buyer'],
    });

    expect(screen.getByTestId('zoho-sync-status')).toHaveTextContent('Zoho sync failed: Zoho down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(retryMutateAsyncMock).toHaveBeenCalledWith('e1');
  });

  it('shows the pending Zoho state without a retry button', () => {
    renderBar({ ...businessEntry, status: 'resolved', external_sync_status: 'pending', allowed_actions: [] });

    expect(screen.getByTestId('zoho-sync-status')).toHaveTextContent('Syncing to Zoho');
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
  });

  it('decline requires a note before the confirm button is enabled', () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Decline' });
    expect(confirmButton).toBeDisabled();
  });

  it('decline submits action=decline with the typed note once enabled', async () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    const dialog = screen.getByRole('dialog');
    const textarea = within(dialog).getByLabelText('Reason for declining');
    fireEvent.change(textarea, { target: { value: 'GST mismatch' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(applyApprovalMutateAsyncMock).toHaveBeenCalledWith({ entryId: 'e1', action: 'decline', note: 'GST mismatch' }),
    );
  });

  it('request-more-info checklist shows only contact_name/address for new_user_login, not business fields', () => {
    renderBar(individualEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Request info' }));

    expect(screen.getByText('contact name')).toBeInTheDocument();
    expect(screen.getByText('address')).toBeInTheDocument();
    expect(screen.queryByText('GSTIN')).not.toBeInTheDocument();
    expect(screen.queryByText('business name')).not.toBeInTheDocument();
    expect(screen.queryByText('GST certificate')).not.toBeInTheDocument();
  });

  it('request-more-info checklist shows all 6 fields for business_approval', () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Request info' }));

    expect(screen.getByText('GSTIN')).toBeInTheDocument();
    expect(screen.getByText('business name')).toBeInTheDocument();
    expect(screen.getByText('GST certificate')).toBeInTheDocument();
  });

  it('request-more-info submits the checked fields as metadata.missing_fields', async () => {
    renderBar(businessEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Request info' }));
    fireEvent.click(screen.getByText('GST certificate'));

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(applyApprovalMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: 'e1', action: 'request_more_info', metadata: { missing_fields: ['gst_certificate'] } }),
      ),
    );
  });

  it('a waiting entry shows the flagged missing fields as context and only a reopen action, no approve/decline', () => {
    renderBar(waitingEntry);

    expect(screen.getByText(/Waiting on the buyer for/)).toBeInTheDocument();
    expect(screen.getByText(/GST certificate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });
});
