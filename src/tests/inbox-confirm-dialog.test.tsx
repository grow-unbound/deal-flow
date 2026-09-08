import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxConfirmDialog } from '@/components/seller/inbox/InboxConfirmDialog';
import * as confirmPrefs from '@/lib/inbox/inbox-confirm-prefs';

describe('InboxConfirmDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <InboxConfirmDialog
        open
        onOpenChange={() => {}}
        title="Decline this account?"
        description="Ramesh Traders will be notified they were not approved."
        confirmLabel="Decline"
        tenantId="t1"
        actionKey="decline"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('persists the skip preference when the checkbox is checked before confirming', () => {
    const setSkipSpy = vi.spyOn(confirmPrefs, 'setSkipConfirm');
    render(
      <InboxConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reject this order?"
        description="Buyer will be notified."
        confirmLabel="Reject"
        tenantId="t1"
        actionKey="reject"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/don't ask me again/i));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(setSkipSpy).toHaveBeenCalledWith('t1', 'reject');
  });
});
