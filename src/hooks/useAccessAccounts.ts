'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountAction } from '@/components/buyer/onboarding/ExistingBuyerAccountPicker';
import { apiFetch } from '@/lib/api-fetch';
import { writeStoredBuyAsBuyerId } from '@/lib/buy-as-storage';
import { STOREFRONT } from '@/lib/storefront-paths';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { AccessAccount } from '@/lib/server/buyer-access-accounts';

/**
 * The caller's accounts for their phone at this tenant (GET /api/buyer/access/accounts), for the
 * pending-buyer screens. `accounts` stays null until the lookup succeeds, so callers can fall back
 * to what /api/buyer/me alone says; `lookupDone` flips once it has settled either way.
 */
export function useAccessAccounts(enabled: boolean, refreshKey?: string | null) {
  const [accounts, setAccounts] = useState<AccessAccount[] | null>(null);
  const [currentBuyerId, setCurrentBuyerId] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch('/api/buyer/access/accounts');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.accounts)) {
        setAccounts(data.accounts as AccessAccount[]);
        setCurrentBuyerId(typeof data.current_buyer_id === 'string' ? data.current_buyer_id : null);
      }
    } catch {
      // Non-critical: the screen still works from /api/buyer/me alone.
    } finally {
      setLookupDone(true);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, refreshKey, reload]);

  return { accounts, currentBuyerId, lookupDone, reload };
}

/**
 * Open an enabled account, or step into one that still needs something from the buyer: re-mint the
 * session for that account (OTP-verified phone only, see /api/auth/switch-buyer) and go there.
 */
export function useAccountSwitch(tenantId: string | null | undefined) {
  const [busyBuyerId, setBusyBuyerId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const openAccount = useCallback(
    async (account: AccessAccount, action: Exclude<AccountAction, 'select' | null>) => {
      setBusyBuyerId(account.buyer_id);
      setError('');
      try {
        const res = await apiFetch('/api/auth/switch-buyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buyer_id: account.buyer_id }),
        });
        const data: { session?: { access_token: string; refresh_token: string }; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !data.session) {
          setError(data.error ?? 'Could not open that account. Please try again.');
          return;
        }
        await supabaseBrowser.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (action === 'open' && tenantId) writeStoredBuyAsBuyerId(tenantId, account.buyer_id);
        // Hard navigation: a soft one can serve a cached payload for the previous account.
        window.location.assign(
          action === 'resubmit' ? '/resubmit-documents' : action === 'complete_details' ? '/onboarding' : STOREFRONT.home,
        );
      } catch {
        setError('Could not open that account. Please try again.');
      } finally {
        setBusyBuyerId(null);
      }
    },
    [tenantId],
  );

  return { busyBuyerId, error, openAccount, clearError: () => setError('') };
}
