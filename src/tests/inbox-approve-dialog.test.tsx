import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const mutateAsyncMock = vi.fn().mockResolvedValue({});
const optionsState: { data: unknown; isError: boolean } = { data: undefined, isError: false };
const previewCalls: Array<[string | null, string | null, boolean]> = [];
const previewState: { data: unknown; isPending: boolean } = { data: { headline: null, applicable: [] }, isPending: false };

vi.mock('@/hooks/useInboxEntries', () => ({
  useBuyerOutstandingInvoices: () => ({ data: undefined, isLoading: false, isError: false }),
  useApplyApprovalEntryAction: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  useApprovalAssignmentOptions: () => optionsState,
  useApprovalPricePreview: (cohortId: string | null, priceListId: string | null, enabled: boolean) => {
    previewCalls.push([cohortId, priceListId, enabled]);
    return previewState;
  },
}));

import { InboxApproveDialog } from '@/components/seller/inbox/InboxApproveDialog';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const entry = {
  id: 'e1', buyer_name: 'Sri Krishna Enterprises', entry_type: 'business_approval', status: 'new',
} as unknown as InboxEntry;

const options = {
  cohorts: [
    { id: 'c-retail', name: 'Retailers', membership_mode: 'manual', eligible: true, member_count: 12, ineligible_reason: null },
    { id: 'c-auto', name: 'Big spenders', membership_mode: 'automatic', eligible: false, member_count: 4, ineligible_reason: 'auto' },
  ],
  price_lists: [{ id: 'pl-1', name: 'Wholesale list', priority: 1, has_zoho_pricebook: false }],
  default_cohort_id: 'c-retail',
  zoho_active: true,
};

function renderDialog(onOpenChange = vi.fn(), onApproved = vi.fn()) {
  render(<InboxApproveDialog entry={entry} open onOpenChange={onOpenChange} onApproved={onApproved} />);
  return { onOpenChange, onApproved };
}

describe('InboxApproveDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    previewCalls.length = 0;
    optionsState.data = options;
    optionsState.isError = false;
    previewState.data = { headline: { name: 'Wholesale list', source: 'buyer' }, applicable: [] };
    previewState.isPending = false;
  });

  it('preselects the tenant default group and previews prices for it', () => {
    renderDialog();

    expect(screen.getByLabelText('Customer group')).toHaveValue('c-retail');
    expect(previewCalls.at(-1)).toEqual(['c-retail', null, true]);
    expect(screen.getByTestId('approve-price-preview')).toHaveTextContent('This buyer will see prices from: Wholesale list');
  });

  it('lists automatic groups as disabled, and offers an explicit "No group" choice', () => {
    renderDialog();

    const group = screen.getByLabelText('Customer group');
    const autoOption = within(group).getByRole('option', { name: /Big spenders/ }) as HTMLOptionElement;
    expect(autoOption.disabled).toBe(true);
    expect(within(group).getByRole('option', { name: /No group – use default pricing/ })).toBeInTheDocument();
  });

  it('confirming sends the chosen group and price list override with assignment_confirmed', async () => {
    const { onOpenChange, onApproved } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Price list/), { target: { value: 'pl-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and approve' }));

    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        entryId: 'e1',
        action: 'approve',
        cohort_id: 'c-retail',
        price_list_id: 'pl-1',
        assignment_confirmed: true,
      }),
    );
    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('"No group" approves with cohort_id null (not blocked for tenants without groups)', async () => {
    optionsState.data = { ...options, cohorts: [], default_cohort_id: null };
    previewState.data = { headline: null, applicable: [] };
    renderDialog();

    expect(screen.getByLabelText('Customer group')).toHaveValue('none');
    expect(screen.getByTestId('approve-price-preview')).toHaveTextContent('default catalogue prices');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and approve' }));
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ cohort_id: null, price_list_id: null, assignment_confirmed: true })),
    );
  });

  it('cannot be confirmed until the options have loaded', () => {
    optionsState.data = undefined;
    renderDialog();

    expect(screen.getByRole('button', { name: 'Confirm and approve' })).toBeDisabled();
    expect(screen.getByTestId('approve-price-preview')).toHaveTextContent('Checking pricing');
  });

  it('keeps the dialog open when approval fails', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('The selected price list is inactive'));
    const { onOpenChange, onApproved } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and approve' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(onApproved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('mentions Zoho for Zoho tenants', () => {
    renderDialog();
    expect(screen.getByText(/created in Zoho/)).toBeInTheDocument();
  });
});
