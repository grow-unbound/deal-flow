'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store } from 'lucide-react';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { apiFetch } from '@/lib/api-fetch';
import { needsIntakeForm } from '@/lib/buyer-pending-destination';
import { Button } from '@/components/ui/button';
import { buildWhatsAppChatUrl } from '@/constants/auth-login-copy';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { DeclinedContactScreen } from '@/components/buyer/onboarding/DeclinedContactScreen';
import { STOREFRONT } from '@/lib/storefront-paths';

/**
 * Blocked screen for a self-registered buyer awaiting seller approval
 * (Yukti_Inbox_Feature-Spec_v1.md §7.1). Shown until buyer_app_enabled
 * flips true — the buyer simply lands on the storefront home instead, next time
 * /api/buyer/me reports mode:'buyer'. No polling, matching the rest of
 * this app's approval-gate pattern (see /consent).
 */
export default function BuyerPendingPage() {
  const router = useRouter();
  const { data: me, isLoading, refetch } = useBuyerMe();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');

  const notPending = !isLoading && (!me || me.mode !== 'pending');
  const needsIntake = !isLoading && needsIntakeForm(me);
  const needsMoreInfo = !isLoading && me?.mode === 'pending' && me.pending?.onboarding_status === 'needs_more_info';
  useEffect(() => {
    if (needsMoreInfo) {
      router.replace('/resubmit-documents');
      return;
    }
    if (notPending) {
      router.replace(me ? STOREFRONT.home : '/login');
      return;
    }
    if (needsIntake) {
      router.replace('/onboarding');
    }
  }, [notPending, needsIntake, needsMoreInfo, me, router]);
  if (notPending || needsIntake || needsMoreInfo) return null;

  const sellerName = me?.tenant?.name ?? 'the seller';
  const sellerWhatsappNumber = me?.pending?.seller_whatsapp_number ?? null;
  const isDeclined = me?.pending?.onboarding_status === 'declined';
  const publicBrowseAllowed = me?.buyer_catalog?.public_browse_allowed === true;

  // An existing buyer (seller/ERP-created, app access disabled) has nothing to register — they
  // ask the seller to switch access on. The request is a seller-inbox entry, not an intake form.
  const canRequestAccess =
    me?.pending?.self_registered === false &&
    !me.pending.access_requested &&
    !me.pending.intake_submitted &&
    me.pending.onboarding_status !== 'needs_more_info';

  async function handleRequestAccess() {
    setRequesting(true);
    setRequestError('');
    try {
      const res = await apiFetch('/api/buyer/access/request', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRequestError(typeof data?.error === 'string' ? data.error : 'Could not send your request. Please try again.');
        return;
      }
      await refetch();
    } catch {
      setRequestError('Could not send your request. Please try again.');
    } finally {
      setRequesting(false);
    }
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.replace('/login');
  }

  if (isDeclined) {
    return (
      <DeclinedContactScreen
        sellerName={sellerName}
        sellerWhatsappNumber={sellerWhatsappNumber}
        publicBrowseAllowed={publicBrowseAllowed}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="mb-7 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
        </div>

        <h1 className="text-h3 font-display text-cream-900 mb-1">
          {canRequestAccess ? 'Access needed' : 'Request sent'}
        </h1>
        {canRequestAccess ? (
          <div className="mb-6 mt-4 space-y-4">
            <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 space-y-2">
              <p className="text-body-sm text-warning-700 font-medium">
                Your account with {sellerName} doesn't have app access yet.
              </p>
              <p className="text-body-sm text-warning-700/90">
                Request access and {sellerName} will be notified to switch it on.
              </p>
            </div>
            {requestError ? <p className="text-body-sm text-danger-500">{requestError}</p> : null}
            <Button className="w-full" onClick={() => void handleRequestAccess()} disabled={requesting}>
              {requesting ? 'Sending request…' : 'Request access'}
            </Button>
          </div>
        ) : (
          <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 space-y-2 mb-6 mt-4">
            <p className="text-body-sm text-warning-700 font-medium">
              {sellerName} needs to approve your access before you can view pricing or place orders.
            </p>
            <p className="text-body-sm text-warning-700/90">
              They typically approve within 24 hours. We'll let you in as soon as that happens.
            </p>
          </div>
        )}

        {publicBrowseAllowed ? (
          <Link
            href={STOREFRONT.home}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-ember-400 hover:bg-ember-500 text-cream-50 text-body-sm font-semibold transition-colors duration-base mb-3"
          >
            <Store className="h-4 w-4" />
            Browse the public catalog
          </Link>
        ) : null}

        {sellerWhatsappNumber && (
          <button
            type="button"
            onClick={() =>
              window.open(
                buildWhatsAppChatUrl(
                  sellerWhatsappNumber,
                  `Hi ${sellerName}, I'd like to get access to your Yukti catalog. Can you please confirm once you've approved my access.`,
                ),
                '_blank',
                'noopener,noreferrer',
              )
            }
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base mb-3"
          >
            Message {sellerName} on WhatsApp
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-caption text-cream-600 hover:text-cream-800 transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
