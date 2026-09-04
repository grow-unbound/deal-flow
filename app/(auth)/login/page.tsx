'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { PhoneInput } from '@/components/buyer/auth/PhoneInput';
import { hasLoggedInOnDevice, markLoggedInOnDevice } from '@/lib/auth-device-login';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import {
  AUTH_LOGIN_COPY,
  buildInformSellerMessage,
  buildRequestAccessMessage,
  buildWhatsAppChatUrl,
  openWhatsAppShare,
} from '@/constants/auth-login-copy';
import { StorefrontPhoneLogin } from '@/components/buyer/auth/StorefrontPhoneLogin';
import { CatalogBuyerAuthHero } from '@/components/buyer/auth/CatalogBuyerAuthHero';
import { useCatalogTenantContext } from '@/hooks/useCatalogTenantContext';
import { parseRequestHost, sellerAppHostForRequest } from '@/lib/storefront-host';

type LoginView = 'otp' | 'email';
type LoginResolution =
  | { kind: 'unregistered' }
  | {
      kind: 'blocked';
      reason: 'seller_disabled' | 'buyer_disabled';
      sellerName: string;
      sellerWhatsappNumber: string | null;
      buyerName: string | null;
    };

interface PhoneOtpSendResponse {
  ref_id: string | null;
  registered: boolean;
  outcome: 'otp_sent' | 'unregistered' | 'seller_disabled' | 'buyer_disabled';
  message: string;
  seller_name: string | null;
  seller_whatsapp_number: string | null;
  buyer_name: string | null;
}

function isPhoneOtpSendResponse(
  data: PhoneOtpSendResponse | { error?: string },
): data is PhoneOtpSendResponse {
  return 'registered' in data;
}

function safeNext(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//')) return null;
    if (
      decoded.startsWith('/buy/')
      || decoded.startsWith('/c/')
      || decoded === '/'
      || decoded.startsWith('/product/')
      || decoded.startsWith('/category/')
      || decoded.startsWith('/brand/')
      || decoded.startsWith('/list/')
      || decoded.startsWith('/search')
      || decoded.startsWith('/cart')
      || decoded.startsWith('/orders')
      || decoded.startsWith('/profile')
    ) {
      return decoded;
    }
  } catch { /* ignore */ }
  return null;
}

function LoginForm() {
  const router = useRouter();
  const posthog = usePostHog();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const accountVerified = searchParams.get('verified') === '1';
  const prefillEmail = searchParams.get('email') ?? '';
  const requestedView = searchParams.get('view');
  const next = safeNext(searchParams.get('next'));
  // Absolute cross-origin return URL (e.g. the tenant product page a buyer was
  // on before being sent here to log in) — deliberately separate from `next`,
  // which safeNext() restricts to relative paths. Real validation happens
  // server-side in /api/auth/phone-otp/verify against the resolved tenant
  // host; this is just carried through untouched.
  const returnTo = searchParams.get('return_to');
  const {
    isCatalogHost,
    tenant: returnToTenant,
    tenantLoading: returnToTenantLoading,
  } = useCatalogTenantContext();

  const [view, setView] = useState<LoginView>(
    requestedView === 'email' || prefillEmail ? 'email' : 'otp',
  );

  const [phoneFormKey, setPhoneFormKey] = useState(0);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [resolution, setResolution] = useState<LoginResolution | null>(null);

  const [identifier, setIdentifier] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  // null until client read — avoids hydration mismatch; returning users never flash subtitle
  const [showWelcomeSubtitle, setShowWelcomeSubtitle] = useState<boolean | null>(null);

  useEffect(() => {
    if (isCatalogHost) {
      setView('otp');
    }
  }, [isCatalogHost]);

  useEffect(() => {
    setShowWelcomeSubtitle(!hasLoggedInOnDevice());
  }, []);

  const sellerLoginUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${sellerAppHostForRequest(window.location.host)}/login`
    : '/login';

  async function handlePhoneSubmit(phoneNumber: string) {
    setPhoneError('');
    setResolution(null);
    setPhoneLoading(true);
    let shouldResetLoading = true;

    try {
      const res = await fetch('/api/auth/phone-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = (await res.json()) as PhoneOtpSendResponse | { error?: string };

      if (!isPhoneOtpSendResponse(data)) {
        captureLoginFailed({
          method: 'phone_otp',
          failure_type: 'otp_send_api_error',
          status: res.status,
        });
        setPhoneError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      if (data.registered) {
        shouldResetLoading = false;
        router.push(
          `/verify?ref_id=${encodeURIComponent(data.ref_id ?? '')}&phone=${encodeURIComponent(phoneNumber)}`
          + (next ? `&next=${encodeURIComponent(next)}` : '')
          + (returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''),
        );
        return;
      }

      if (data.outcome === 'unregistered') {
        captureLoginFailed({
          method: 'phone_otp',
          failure_type: 'unregistered_phone',
          status: res.status,
          outcome: data.outcome,
        });
        setResolution({ kind: 'unregistered' });
        return;
      }

      captureLoginFailed({
        method: 'phone_otp',
        failure_type: data.outcome === 'buyer_disabled' ? 'buyer_app_access_disabled' : 'seller_buyer_app_disabled',
        status: res.status,
        outcome: data.outcome,
      });
      setResolution({
        kind: 'blocked',
        reason: data.outcome === 'buyer_disabled' ? 'buyer_disabled' : 'seller_disabled',
        sellerName: data.seller_name ?? 'this seller',
        sellerWhatsappNumber: data.seller_whatsapp_number,
        buyerName: data.buyer_name,
      });
    } catch {
      captureLoginFailed({
        method: 'phone_otp',
        failure_type: 'network_error',
      });
      setPhoneError('Network error. Please check your connection and try again.');
    } finally {
      if (shouldResetLoading) setPhoneLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');
    setEmailLoading(true);
    let shouldResetLoading = true;

    try {
      type SignInResponse = {
        error?: string;
        redirect?: string;
        user?: { id: string; email: string };
        session?: { access_token: string; refresh_token: string };
        pending_verification?: boolean;
        user_id?: string;
        email?: string;
        phone?: string | null;
      };

      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(posthog?.get_distinct_id() && { 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() }),
          ...(posthog?.get_session_id() && { 'X-POSTHOG-SESSION-ID': posthog.get_session_id() }),
        },
        body: JSON.stringify({ identifier, password }),
      });

      const data = (await res.json()) as SignInResponse;

      if (!res.ok) {
        captureLoginFailed({
          method: 'email_password',
          failure_type: data.error === 'Invalid email or password' ? 'invalid_credentials' : 'email_login_api_error',
          status: res.status,
        });
        setEmailError(data.error || 'Login failed');
        return;
      }

      if (data.pending_verification) {
        posthog?.capture('login_pending_verification', {
          method: 'email_password',
          has_next: Boolean(next),
        });
        const params = new URLSearchParams({
          email: data.email ?? identifier,
          uid: data.user_id ?? '',
          ...(data.phone ? { phone: data.phone } : {}),
        });
        shouldResetLoading = false;
        router.replace(`/verify-account?${params.toString()}`);
        return;
      }

      if (!data.session?.access_token || !data.session?.refresh_token) {
        captureLoginFailed({
          method: 'email_password',
          failure_type: 'missing_session',
          status: res.status,
        });
        setEmailError('Session was not created');
        return;
      }

      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      markLoggedInOnDevice();

      posthog?.identify(data.user?.id ?? identifier, { email: data.user?.email ?? identifier });

      shouldResetLoading = false;
      const baseRedirect = data.redirect ?? '/dashboard';
      const redirectPath =
        next && baseRedirect.startsWith('/buy')
          ? next
          : accountVerified && baseRedirect === '/dashboard'
            ? '/dashboard?first_run=1'
            : baseRedirect;
      router.replace(redirectPath);
      router.refresh();
    } catch {
      captureLoginFailed({
        method: 'email_password',
        failure_type: 'network_or_unexpected_error',
      });
      setEmailError('An error occurred. Please try again.');
    } finally {
      if (shouldResetLoading) setEmailLoading(false);
    }
  }

  function resetPhoneEntry() {
    setResolution(null);
    setPhoneError('');
    setPhoneFormKey((current) => current + 1);
  }

  function handleRequestAccess() {
    if (!resolution || resolution.kind !== 'blocked' || !resolution.sellerWhatsappNumber) return;

    const message = buildRequestAccessMessage({
      sellerName: resolution.sellerName,
      buyerName: resolution.buyerName,
    });

    window.open(buildWhatsAppChatUrl(resolution.sellerWhatsappNumber, message), '_blank', 'noopener,noreferrer');
  }

  async function handleInformSeller() {
    const signupLink = new URL('/signup', window.location.origin).toString();
    const message = buildInformSellerMessage({ signupLink });
    openWhatsAppShare(message);
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls =
    'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

  function captureLoginFailed(properties: {
    method: 'phone_otp' | 'email_password';
    failure_type: string;
    status?: number;
    outcome?: string | null;
  }) {
    posthog?.capture('login_failed', {
      ...properties,
      has_next: Boolean(next),
      requested_view: view,
    });
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      {isCatalogHost ? (
        <CatalogBuyerAuthHero
          variant="login"
          tenant={returnToTenant}
          tenantLoading={returnToTenantLoading}
        />
      ) : (
        <>
          <h1
            className={
              showWelcomeSubtitle
                ? 'font-display text-h2 text-cream-900 mb-1'
                : 'font-display text-h2 text-cream-900 mb-6'
            }
          >
            {AUTH_LOGIN_COPY.login.welcomeTitle}
          </h1>
          {showWelcomeSubtitle ? (
            <p className="text-body-sm text-cream-600 mb-6">
              {AUTH_LOGIN_COPY.login.welcomeSubtitle}
            </p>
          ) : null}
        </>
      )}

      {accountVerified && (
        <div className="mb-4 rounded-md bg-teal-50 border border-teal-200 px-4 py-3">
          <p className="text-body-sm text-teal-800 font-medium">
            Account verified! Sign in to access your workspace.
          </p>
        </div>
      )}

      {resetSuccess && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-body-sm text-green-800 font-medium">
            Password updated. Sign in with your new password.
          </p>
        </div>
      )}

      {view === 'otp' || isCatalogHost ? (
        <>
          <p className="text-body-sm text-cream-600 mb-6">
            {AUTH_LOGIN_COPY.login.landingBody}
          </p>

          {resolution ? (
            <div className="space-y-4">
              <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 space-y-2">
                {resolution.kind === 'unregistered' ? (
                  <>
                    <p className="text-body-sm text-warning-700 font-medium">
                      {isCatalogHost
                        ? 'This number is not linked to a buyer account yet.'
                        : AUTH_LOGIN_COPY.resolution.unregistered.title}
                    </p>
                    {isCatalogHost ? (
                      <p className="text-body-sm text-warning-700/90">
                        Ask your supplier to add you as a buyer, or sign in on the seller app if you distribute products.
                      </p>
                    ) : (
                      AUTH_LOGIN_COPY.resolution.unregistered.lines.map((line) => (
                        <p key={line} className="text-body-sm text-warning-700/90">
                          {line}
                        </p>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-body-sm text-warning-700 font-medium">
                      {resolution.reason === 'seller_disabled'
                        ? AUTH_LOGIN_COPY.resolution.sellerDisabled.title({ sellerName: resolution.sellerName })
                        : AUTH_LOGIN_COPY.resolution.buyerDisabled.title({ sellerName: resolution.sellerName })}
                    </p>
                    <p className="text-body-sm text-warning-700/90">
                      {resolution.reason === 'seller_disabled'
                        ? AUTH_LOGIN_COPY.resolution.sellerDisabled.body
                        : AUTH_LOGIN_COPY.resolution.buyerDisabled.body}
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-3">
                {resolution.kind === 'unregistered' ? (
                  isCatalogHost ? (
                    <a
                      href={sellerLoginUrl}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base"
                    >
                      Go to seller login
                    </a>
                  ) : (
                    <>
                      <Link
                        href="/signup"
                        className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base"
                      >
                        {AUTH_LOGIN_COPY.login.createSellerAccount}
                      </Link>
                      <button
                        type="button"
                        onClick={handleInformSeller}
                        className="w-full px-4 py-2.5 rounded-md border border-cream-300 bg-white text-cream-800 text-body-sm font-semibold hover:bg-cream-50 transition-colors"
                      >
                        {AUTH_LOGIN_COPY.login.informSeller}
                      </button>
                      <button
                        type="button"
                        onClick={resetPhoneEntry}
                        className="w-full px-4 py-2.5 rounded-md border border-cream-300 bg-white text-cream-800 text-body-sm font-semibold hover:bg-cream-50 transition-colors"
                      >
                        {AUTH_LOGIN_COPY.login.tryDifferentNumber}
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleRequestAccess}
                      disabled={!resolution.sellerWhatsappNumber}
                      className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {AUTH_LOGIN_COPY.login.requestAccess}
                    </button>
                    <button
                      type="button"
                      onClick={resetPhoneEntry}
                      className="w-full px-4 py-2.5 rounded-md border border-cream-300 bg-white text-cream-800 text-body-sm font-semibold hover:bg-cream-50 transition-colors"
                    >
                      {AUTH_LOGIN_COPY.login.tryDifferentNumber}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <PhoneInput
              key={phoneFormKey}
              onSubmit={handlePhoneSubmit}
              loading={phoneLoading}
              error={phoneError}
              submitLabel={isCatalogHost ? 'Send OTP' : undefined}
              loadingLabel={isCatalogHost ? 'Sending OTP…' : undefined}
            />
          )}
        </>
      ) : (
        <>
          <p className="text-body-sm text-cream-600 mb-6">
            {AUTH_LOGIN_COPY.login.emailBody}
          </p>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
                Email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setEmailError('');
                }}
                disabled={emailLoading}
                required
                autoComplete="username"
                className={inputCls}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', marginBottom: 0 }}>
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-caption font-medium transition-colors"
                  style={{ color: 'var(--ember-400)', fontSize: 'var(--yk-text-xs)' }}
                >
                  {AUTH_LOGIN_COPY.login.forgotPassword}
                </Link>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={emailLoading}
                required
                autoComplete="current-password"
                className={inputCls}
              />
            </div>

            {emailError && (
              <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">
                {emailError}
              </p>
            )}

            <button
              type="submit"
              disabled={emailLoading}
              className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailLoading ? AUTH_LOGIN_COPY.login.signInLoading : AUTH_LOGIN_COPY.login.signIn}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-cream-200">
            <button
              type="button"
              onClick={() => {
                setView('otp');
                setEmailError('');
              }}
              className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
            >
              {AUTH_LOGIN_COPY.login.loginWithMobileOtp}
            </button>
          </div>
        </>
      )}

      {!isCatalogHost ? (
        <div className="mt-4 text-right">
          <Link
            href="/signup"
            className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
          >
            {AUTH_LOGIN_COPY.login.createSellerAccount}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-full max-w-sm rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="mb-4 h-4 w-64 rounded bg-cream-200 animate-pulse" />
      <div className="space-y-4">
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
      </div>
    </div>
  );
}

function TenantStorefrontLogin() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next')) ?? '/';
  return <StorefrontPhoneLogin nextPath={next} />;
}

function LoginSwitcher() {
  const [storefront, setStorefront] = useState(false);
  useEffect(() => {
    setStorefront(parseRequestHost(window.location.host).kind === 'tenant');
  }, []);
  if (storefront) return <TenantStorefrontLogin />;
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginSwitcher />
    </Suspense>
  );
}
