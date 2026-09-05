'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { OtpForm } from '@/components/buyer/auth/OtpForm';
import { CatalogBuyerAuthHero } from '@/components/buyer/auth/CatalogBuyerAuthHero';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { LoginOtpContext } from '@/lib/server/buyer-otp-store';
import { AUTH_LOGIN_COPY, buildWhatsAppChatUrl } from '@/constants/auth-login-copy';
import { markLoggedInOnDevice } from '@/lib/auth-device-login';
import { useCatalogTenantContext } from '@/hooks/useCatalogTenantContext';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

interface SessionPayload {
  access_token: string;
  refresh_token: string;
}

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref_id = searchParams.get('ref_id') ?? '';
  const phone = searchParams.get('phone') ?? '';
  const next = searchParams.get('next') ?? '';
  const returnTo = searchParams.get('return_to') ?? '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    message: string;
    sellerName: string;
    sellerWhatsappNumber: string | null;
  } | null>(null);
  const {
    isCatalogHost,
    tenant: returnToTenant,
    tenantLoading: returnToTenantLoading,
  } = useCatalogTenantContext();

  const loginQuery = [
    returnTo ? `return_to=${encodeURIComponent(returnTo)}` : '',
    next ? `next=${encodeURIComponent(next)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const loginHref = loginQuery ? `/login?${loginQuery}` : '/login';

  // Guard: if no ref_id, redirect back to login
  useEffect(() => {
    if (!ref_id) {
      router.replace('/login');
    }
  }, [ref_id, router]);

  async function handleSubmit(otp: string) {
    setError('');
    setLoading(true);
    let shouldResetLoading = true;

    try {
      const res = await fetch('/api/auth/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_id, otp, return_to: returnTo || undefined }),
      });

      const data: {
        success?: boolean;
        outcome?: string;
        redirect?: string;
        handoff_url?: string;
        contexts?: LoginOtpContext[];
        ref_id?: string;
        session?: SessionPayload;
        message?: string;
        seller_name?: string;
        seller_whatsapp_number?: string | null;
        error?: string;
      } = await res.json();

      if (data.outcome === 'pending_approval') {
        shouldResetLoading = false;
        setPending({
          message: data.message ?? '',
          sellerName: data.seller_name ?? 'the seller',
          sellerWhatsappNumber: data.seller_whatsapp_number ?? null,
        });
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Verification failed. Please try again.');
        return;
      }

      // Cross-origin handoff: OTP was verified on a host other than the
      // buyer's own tenant (e.g. catalog.useyukti.in). When the server also
      // returns a catalog session, set it first so catalog keeps a first-party
      // cookie before redeeming the tenant handoff link.
      if (data.handoff_url) {
        if (data.session?.access_token && data.session?.refresh_token) {
          await supabaseBrowser.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
        shouldResetLoading = false;
        markLoggedInOnDevice();
        window.location.assign(data.handoff_url);
        return;
      }

      if (data.contexts && data.contexts.length > 1 && data.ref_id) {
        // Multiple accounts — let user pick
        try {
          sessionStorage.setItem(SESSION_CONTEXTS_KEY, JSON.stringify(data.contexts));
        } catch {
          // sessionStorage may be unavailable in some environments
        }
        shouldResetLoading = false;
        router.push(`/login/select-context?ref_id=${encodeURIComponent(data.ref_id)}`);
        return;
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        await supabaseBrowser.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        markLoggedInOnDevice();
      }

      // Clear stale buyer route snapshots so a previous buyer's cached home data
      // (e.g. from a seller preview) doesn't render before the fresh API fetch.
      try {
        const SNAPSHOT_PREFIX = 'yukti_route_snapshot:';
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith(SNAPSHOT_PREFIX))
          .forEach((k) => sessionStorage.removeItem(k));
      } catch { /* sessionStorage may be unavailable */ }

      shouldResetLoading = false;
      const serverRedirect = data.redirect ?? '/dashboard';
      // Honor `next` only for buyers landing on /buy/home.
      // Sellers (/dashboard) and first-time buyers (/consent) always follow their server-assigned path.
      const destination =
        serverRedirect === '/buy/home' && next
          ? decodeURIComponent(next)
          : serverRedirect;
      // Hard navigation, not router.replace()/router.refresh() — see
      // /login/select-context/page.tsx for why: a soft navigation back to an
      // already-visited pathname (e.g. re-logging in as a different account in the
      // same tab) can serve a cached RSC payload for the PREVIOUS identity's data.
      window.location.assign(destination);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      if (shouldResetLoading) setLoading(false);
    }
  }

  if (!ref_id) return null; // redirecting

  if (pending) {
    return (
      <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
        {isCatalogHost ? (
          <CatalogBuyerAuthHero
            variant="pending"
            tenant={returnToTenant}
            tenantLoading={returnToTenantLoading}
          />
        ) : (
          <>
            <div className="mb-7 flex justify-center">
              <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
            </div>
            <h1 className="text-h3 font-display text-cream-900 mb-1">Request sent</h1>
          </>
        )}
        {isCatalogHost && returnToTenant ? (
          <p className="mb-6 text-body-sm text-cream-600">
            You can keep browsing the catalog in the meantime — we&apos;ll let you know once you&apos;re
            approved.
          </p>
        ) : (
          <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 space-y-2 mb-6">
            <p className="text-body-sm text-warning-700 font-medium">
              {pending.sellerName} needs to approve your access before you can view pricing or place orders.
            </p>
            <p className="text-body-sm text-warning-700/90">
              You can keep browsing the catalog in the meantime — we&apos;ll let you know once you&apos;re
              approved.
            </p>
          </div>
        )}
        {pending.sellerWhatsappNumber && (
          <button
            type="button"
            onClick={() =>
              window.open(
                buildWhatsAppChatUrl(pending.sellerWhatsappNumber!, pending.message),
                '_blank',
                'noopener,noreferrer',
              )
            }
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base mb-3"
          >
            Message {pending.sellerName} on WhatsApp
          </button>
        )}
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="w-full text-caption text-cream-600 hover:text-cream-800 transition-colors"
        >
          Back to browsing
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      {isCatalogHost ? (
        <CatalogBuyerAuthHero
          variant="verify"
          tenant={returnToTenant}
          tenantLoading={returnToTenantLoading}
        />
      ) : (
        <>
          <div className="mb-7 flex justify-center">
            <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
          </div>

          <h1 className="text-h3 font-display text-cream-900 mb-1">Enter OTP</h1>
          <p className="text-body-sm text-cream-600 mb-6">
            We sent a 6-digit code to your WhatsApp.
          </p>
        </>
      )}

      <OtpForm
        phone={phone}
        onSubmit={handleSubmit}
        loading={loading}
        error={error}
      />

      <div className="mt-6 pt-4 border-t border-cream-200 flex items-center justify-between">
        <Link
          href={loginHref}
          className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
        >
          ← {AUTH_LOGIN_COPY.login.changeNumber}
        </Link>
        <div className="flex items-center gap-4">
          {!isCatalogHost ? (
            <Link
              href="/login?view=email"
              className="text-caption text-cream-600 hover:text-cream-800 transition-colors"
            >
              {AUTH_LOGIN_COPY.login.loginWithEmail}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(loginHref)}
            className="text-caption text-cream-600 hover:text-cream-800 transition-colors"
          >
            {AUTH_LOGIN_COPY.login.resendOtp}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifyOtpFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="h-4 w-32 rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-48 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="flex gap-2 justify-between">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-10 h-12 rounded bg-cream-200 animate-pulse" />
        ))}
      </div>
      <div className="mt-4 h-10 w-full rounded bg-cream-200 animate-pulse" />
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyOtpFallback />}>
      <VerifyOtpForm />
    </Suspense>
  );
}
