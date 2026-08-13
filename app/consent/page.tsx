'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { Button } from '@/components/ui/button';
import { useBuyerMe, type BuyerMeData } from '@/hooks/useBuyerMe';
import { apiFetch } from '@/lib/api-fetch';

/**
 * WhatsApp Broadcast Phase C — buyer explicit-consent gate (spec §4.8, §9).
 *
 * Forced, one-time interstitial shown right after first OTP login, before any
 * /buy/* route is reachable. There is no "decline and continue" path for MVP —
 * the checkbox must be checked to proceed. Once app.buyers.whatsapp_consent_at
 * is stamped, /api/buyer/me reports whatsapp_consent_required=false and this
 * page is never shown again.
 */
export default function WhatsappConsentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useBuyerMe();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Already consented (or nothing to gate, e.g. seller preview) — skip straight through.
  const shouldSkip = !isLoading && !!me && !me.whatsapp_consent_required;
  useEffect(() => {
    if (shouldSkip) router.replace('/buy/catalog');
  }, [shouldSkip, router]);
  if (shouldSkip) return null;

  const sellerName = me?.tenant?.name ?? 'your distributor';

  async function handleConfirm() {
    if (!agreed || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/buyer/whatsapp-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      // BuyerShell reads useBuyerMe() — update cache before navigating or it
      // still sees whatsapp_consent_required=true and bounces back here.
      queryClient.setQueryData<BuyerMeData>(['buyer-me'], (old) =>
        old ? { ...old, whatsapp_consent_required: false } : old,
      );
      const meRes = await apiFetch('/api/buyer/me', { fresh: true });
      if (meRes.ok) {
        const latestMe = await meRes.json() as BuyerMeData;
        queryClient.setQueryData<BuyerMeData>(['buyer-me'], latestMe);
      }
      router.replace('/buy/catalog');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="mb-7 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
        </div>

        <h1 className="text-h3 font-display text-cream-900 mb-1">One more step</h1>
        <p className="text-body-sm text-cream-600 mb-6">
          Before you continue, please confirm how {sellerName} can reach you.
        </p>

        <label className="flex items-start gap-3 rounded-md border border-cream-300 bg-cream-50 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting || isLoading}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-cream-400 text-teal-600 focus:ring-teal-400/30"
          />
          <span className="text-body-sm text-cream-800">
            I agree to receive WhatsApp communication from {sellerName}, including order updates and marketing messages. 
            You can opt out anytime by replying STOP.
          </span>
        </label>

        {error && (
          <p className="mt-3 text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
        )}

        <Button
          type="button"
          className="w-full mt-6"
          disabled={!agreed || submitting || isLoading}
          onClick={handleConfirm}
          haptic
        >
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
