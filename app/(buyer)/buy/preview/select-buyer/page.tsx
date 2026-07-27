'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { Button } from '@/components/ui/button';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';
import { apiFetch } from '@/lib/api-fetch';

interface PreviewBuyerOption {
  buyer_id: string;
  business_name: string;
  contact_name: string | null;
  buyer_app_enabled: boolean;
}

interface PreviewCandidatesResponse {
  tenant_name: string;
  buyers: PreviewBuyerOption[];
}

export default function PreviewSelectBuyerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [buyers, setBuyers] = useState<PreviewBuyerOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/api/buyer/preview/candidates');
        const data = await res.json() as PreviewCandidatesResponse | { error?: string };
        if (!res.ok || !('buyers' in data)) {
          if (!cancelled) setError('error' in data ? (data.error ?? 'Failed to load buyers') : 'Failed to load buyers');
          return;
        }
        if (!cancelled) {
          setTenantName(data.tenant_name);
          setBuyers(data.buyers);
        }
      } catch {
        if (!cancelled) setError('Network error. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelect(buyerId: string) {
    setSubmittingId(buyerId);
    setError('');
    try {
      const res = await apiFetch('/api/buyer/preview/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId }),
      });
      const data = await res.json() as { redirect?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to open buyer preview');
        return;
      }
      router.replace(data.redirect ?? '/buy/home');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[12px] border border-cream-300 bg-white p-6 shadow-md">
        <div className="mb-6 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-12 w-[68px]" />
        </div>

        <h1 className="text-h3 font-display text-cream-900">
          {AUTH_LOGIN_COPY.resolution.chooseAccount.title}
        </h1>
        <p className="mt-2 text-sm text-cream-600">
          {AUTH_LOGIN_COPY.resolution.chooseAccount.body({ sellerName: tenantName || 'this seller' })}
        </p>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
            ))
          ) : buyers.length === 0 ? (
            <p className="text-sm text-cream-600">No buyer profiles found for your number.</p>
          ) : (
            buyers.map((buyer) => {
              const label = buyer.contact_name?.trim() || buyer.business_name;
              const subtitle = buyer.contact_name?.trim() ? buyer.business_name : null;
              const isSubmitting = submittingId === buyer.buyer_id;

              return (
                <div
                  key={buyer.buyer_id}
                  role="button"
                  tabIndex={submittingId ? -1 : 0}
                  aria-disabled={Boolean(submittingId)}
                  onClick={() => {
                    if (!submittingId) void handleSelect(buyer.buyer_id);
                  }}
                  onKeyDown={(event) => {
                    if (submittingId) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handleSelect(buyer.buyer_id);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[12px] border border-cream-300 px-4 py-3 text-left transition-colors hover:bg-cream-50 aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:pointer-events-none"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cream-900">{label}</p>
                    {subtitle ? <p className="truncate text-xs text-cream-600">{subtitle}</p> : null}
                    {!buyer.buyer_app_enabled ? (
                      <p className="mt-1 text-[11px] text-cream-500">Buyer app access off (preview only)</p>
                    ) : null}
                  </div>
                  <Button type="button" size="sm" disabled={isSubmitting} className="ml-3 shrink-0" tabIndex={-1}>
                    {isSubmitting ? 'Opening…' : 'Open'}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
