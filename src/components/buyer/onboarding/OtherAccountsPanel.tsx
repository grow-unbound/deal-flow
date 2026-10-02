'use client';

import { useState } from 'react';
import { ExistingBuyerAccountPicker } from '@/components/buyer/onboarding/ExistingBuyerAccountPicker';
import { useAccessAccounts, useAccountSwitch } from '@/hooks/useAccessAccounts';
import { apiFetch } from '@/lib/api-fetch';
import type { AccessAccount } from '@/lib/server/buyer-access-accounts';

interface OtherAccountsPanelProps {
  tenantId: string | null | undefined;
  /** Falls back to the account the session is on, as reported by the accounts lookup. */
  currentBuyerId?: string | null;
  /** Skip the lookup (e.g. before the buyer is signed in). */
  enabled?: boolean;
}

/**
 * "Other accounts for this number": the buyer's other accounts at this tenant, with status and one
 * action each — shown on screens that otherwise leave a buyer stuck on a single account (declined,
 * resubmission). Renders nothing when the phone has no other account.
 */
export function OtherAccountsPanel({ tenantId, currentBuyerId, enabled = true }: OtherAccountsPanelProps): React.ReactNode {
  const { accounts, currentBuyerId: sessionBuyerId, reload } = useAccessAccounts(enabled);
  const { busyBuyerId, error, openAccount } = useAccountSwitch(tenantId);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState('');

  const ownId = currentBuyerId ?? sessionBuyerId;
  const others = (accounts ?? []).filter((account) => account.buyer_id !== ownId);
  if (others.length === 0) return null;

  async function requestAccess(account: AccessAccount) {
    setRequestingId(account.buyer_id);
    setRequestError('');
    try {
      const res = await apiFetch('/api/buyer/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: account.buyer_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRequestError(typeof data?.error === 'string' ? data.error : 'Could not send your request. Please try again.');
        return;
      }
      await reload();
    } catch {
      setRequestError('Could not send your request. Please try again.');
    } finally {
      setRequestingId(null);
    }
  }

  return (
    <section className="mt-6 space-y-3 border-t border-cream-200 pt-5" aria-label="Other accounts for this number">
      <div>
        <h2 className="text-body-sm font-semibold text-cream-900">Other accounts for this number</h2>
        <p className="mt-0.5 text-caption text-cream-600">
          You can continue with another account, or request access to one that is switched off.
        </p>
      </div>
      <ExistingBuyerAccountPicker
        accounts={others}
        selectedBuyerId={null}
        busyBuyerId={busyBuyerId ?? requestingId}
        onSelect={() => {}}
        onAction={(account, action) => void openAccount(account, action)}
        requestMode="inline"
        onRequest={(account) => void requestAccess(account)}
      />
      {error || requestError ? <p className="text-body-sm text-danger-500">{error || requestError}</p> : null}
    </section>
  );
}
