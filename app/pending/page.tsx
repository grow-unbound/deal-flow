'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { buildWhatsAppChatUrl } from '@/constants/auth-login-copy';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Blocked screen for a self-registered buyer awaiting seller approval
 * (Yukti_Inbox_Feature-Spec_v1.md §7.1). Shown until buyer_app_enabled
 * flips true — the buyer simply lands on /buy/home instead, next time
 * /api/buyer/me reports mode:'buyer'. No polling, matching the rest of
 * this app's approval-gate pattern (see /consent).
 */
export default function BuyerPendingPage() {
  const router = useRouter();
  const { data: me, isLoading } = useBuyerMe();

  const notPending = !isLoading && (!me || me.mode !== 'pending');
  const needsIntake = !isLoading && me?.mode === 'pending' && !me.pending?.intake_submitted;
  useEffect(() => {
    if (notPending) {
      router.replace(me ? '/buy/home' : '/login');
      return;
    }
    if (needsIntake) {
      router.replace('/onboarding');
    }
  }, [notPending, needsIntake, me, router]);
  if (notPending || needsIntake) return null;

  const sellerName = me?.tenant?.name ?? 'the seller';
  const sellerWhatsappNumber = me?.pending?.seller_whatsapp_number ?? null;

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="mb-7 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
        </div>

        <h1 className="text-h3 font-display text-cream-900 mb-1">Request sent</h1>
        <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 space-y-2 mb-6 mt-4">
          <p className="text-body-sm text-warning-700 font-medium">
            {sellerName} needs to approve your access before you can view pricing or place orders.
          </p>
          <p className="text-body-sm text-warning-700/90">
            They typically approve within 24 hours. We'll let you in as soon as that happens.
          </p>
        </div>

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
