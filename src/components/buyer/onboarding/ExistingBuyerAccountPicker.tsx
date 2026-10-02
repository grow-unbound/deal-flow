'use client';

import { cn } from '@/lib/utils';
import type { AccessAccount, AccessAccountState } from '@/lib/server/buyer-access-accounts';

/** What tapping an account row does, by state. Rows with no action are status-only. */
export type AccountAction = 'open' | 'resubmit' | 'complete_details' | 'select' | null;

const STATE_COPY: Record<AccessAccountState, { badge: string; action: AccountAction; actionLabel?: string }> = {
  active: { badge: 'Active', action: 'open', actionLabel: 'Open' },
  can_request: { badge: 'Access off', action: 'select' },
  requested: { badge: 'Request sent', action: null },
  awaiting_approval: { badge: 'Awaiting approval', action: null },
  needs_more_info: { badge: 'More info needed', action: 'resubmit', actionLabel: 'Resubmit documents' },
  needs_intake: { badge: 'Details needed', action: 'complete_details', actionLabel: 'Complete details' },
  declined: { badge: 'Declined', action: null },
};

export function accountActionFor(state: AccessAccountState): AccountAction {
  return STATE_COPY[state].action;
}

const BADGE_TONE: Record<AccessAccountState, string> = {
  active: 'bg-teal-50 text-teal-700 border border-teal-200',
  can_request: 'bg-warning-50 text-warning-700 border border-warning-200',
  requested: 'bg-cream-100 text-cream-700 border border-cream-200',
  awaiting_approval: 'bg-cream-100 text-cream-700 border border-cream-200',
  needs_more_info: 'bg-warning-50 text-warning-700 border border-warning-200',
  needs_intake: 'bg-warning-50 text-warning-700 border border-warning-200',
  declined: 'bg-danger-50 text-danger-600 border border-danger-200',
};

interface ExistingBuyerAccountPickerProps {
  accounts: AccessAccount[];
  /** Account chosen for "Request access" (only `can_request` rows can be chosen). */
  selectedBuyerId: string | null;
  /** Account whose Open / Resubmit / Complete-details action is in flight. */
  busyBuyerId: string | null;
  onSelect: (buyerId: string) => void;
  onAction: (account: AccessAccount, action: Exclude<AccountAction, 'select' | null>) => void;
  /**
   * 'select' (default): a switched-off row is highlighted and the caller's own button asks for it.
   * 'inline': the row carries its own "Request access" button (compact lists on screens without a
   * main request button, e.g. the declined and resubmission screens) — pass `onRequest`.
   */
  requestMode?: 'select' | 'inline';
  onRequest?: (account: AccessAccount) => void;
}

/**
 * Every account a phone has at this tenant, with its status — row styling follows the workspace
 * picker (WorkspaceLookbook): name + contact, status chip, one clear action per row. Selecting a
 * switched-off account only highlights it; the caller's "Request access" button does the asking.
 */
export function ExistingBuyerAccountPicker({
  accounts,
  selectedBuyerId,
  busyBuyerId,
  onSelect,
  onAction,
  requestMode = 'select',
  onRequest,
}: ExistingBuyerAccountPickerProps): React.ReactNode {
  return (
    <ul className="space-y-2" role="list" aria-label="Your accounts">
      {accounts.map((account) => {
        const copy = STATE_COPY[account.state];
        const isSelectable = copy.action === 'select' && requestMode === 'select';
        const isInlineRequest = copy.action === 'select' && requestMode === 'inline';
        const isSelected = isSelectable && selectedBuyerId === account.buyer_id;
        const isBusy = busyBuyerId === account.buyer_id;
        const rowClass = cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors',
          isSelected ? 'border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20' : 'border-cream-200',
          isSelectable ? 'cursor-pointer hover:border-teal-300 hover:bg-teal-50/30' : '',
        );
        const identity = (
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-cream-900">{account.business_name}</span>
            {account.contact_name ? (
              <span className="mt-0.5 block truncate text-caption text-cream-600">{account.contact_name}</span>
            ) : null}
          </span>
        );
        const badge = (
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium', BADGE_TONE[account.state])}>
            {copy.badge}
          </span>
        );

        return (
          <li key={account.buyer_id}>
            {isSelectable ? (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(account.buyer_id)}
                className={rowClass}
              >
                {identity}
                {badge}
              </button>
            ) : (
              <div className={rowClass}>
                {identity}
                <span className="flex flex-col items-end gap-1.5">
                  {badge}
                  {isInlineRequest ? (
                    <button
                      type="button"
                      disabled={Boolean(busyBuyerId)}
                      onClick={() => onRequest?.(account)}
                      className="rounded-md bg-ember-400 px-3 py-1.5 text-caption font-semibold text-cream-50 transition-colors hover:bg-ember-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? 'Sending…' : 'Request access'}
                    </button>
                  ) : null}
                  {copy.action && copy.action !== 'select' ? (
                    <button
                      type="button"
                      disabled={Boolean(busyBuyerId)}
                      onClick={() => onAction(account, copy.action as Exclude<AccountAction, 'select' | null>)}
                      className="rounded-md bg-ember-400 px-3 py-1.5 text-caption font-semibold text-cream-50 transition-colors hover:bg-ember-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? 'Opening…' : copy.actionLabel}
                    </button>
                  ) : null}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
