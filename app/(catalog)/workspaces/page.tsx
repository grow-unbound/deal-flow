'use client';

import { useCallback, useEffect, useState } from 'react';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { WorkspaceLookbook } from '@/components/buyer/workspace/WorkspaceLookbook';
import { writeStoredBuyAsBuyerId } from '@/lib/buy-as-storage';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { WorkspaceAccount, WorkspaceTenantGroup } from '@/lib/server/workspaces';

interface WorkspacesResponse {
  tenants: WorkspaceTenantGroup[];
  error?: string;
}

export default function WorkspacesPage() {
  const [tenants, setTenants] = useState<WorkspaceTenantGroup[] | null>(null);
  const [error, setError] = useState('');
  const [pendingAccountKey, setPendingAccountKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/workspaces')
      .then(async (res) => {
        const data = (await res.json()) as WorkspacesResponse;
        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load workspaces');
        }
        return data.tenants;
      })
      .then((rows) => {
        if (!cancelled) setTenants(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectAccount = useCallback(async (tenant: WorkspaceTenantGroup, account: WorkspaceAccount) => {
    const key = `${tenant.tenant_id}:${account.buyer_id}:${account.role}`;
    setPendingAccountKey(key);
    setError('');

    try {
      const res = await fetch('/api/auth/workspaces/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.tenant_id,
          buyer_id: account.buyer_id,
          role: account.role,
        }),
      });

      const data: {
        session?: { access_token: string; refresh_token: string };
        handoff_url?: string;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.handoff_url || !data.session) {
        setError(data.error ?? 'Could not open this catalog. Please try again.');
        setPendingAccountKey(null);
        return;
      }

      writeStoredBuyAsBuyerId(tenant.tenant_id, account.buyer_id);
      await supabaseBrowser.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      window.location.assign(data.handoff_url);
    } catch {
      setError('Network error. Please try again.');
      setPendingAccountKey(null);
    }
  }, []);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>
      <h1 className="mb-1 text-center font-display text-h3 text-cream-900">Your catalogs</h1>
      <p className="mb-8 text-center text-body-sm text-cream-600">
        Pick a supplier and business account to continue shopping.
      </p>

      {error ? (
        <p className="mb-6 rounded-md bg-danger-50 px-3 py-2 text-caption text-danger-500">{error}</p>
      ) : null}

      {tenants ? (
        tenants.length > 0 ? (
          <WorkspaceLookbook
            tenants={tenants}
            pendingAccountKey={pendingAccountKey}
            onSelectAccount={handleSelectAccount}
          />
        ) : (
          <p className="text-center text-body-sm text-cream-600">No buyer accounts are linked to your number yet.</p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-cream-200 bg-white">
              <div className="aspect-[16/9] animate-pulse border-b border-cream-200 bg-cream-100" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-cream-100 border border-cream-200" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-cream-100 border border-cream-200" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
