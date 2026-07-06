'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { PhoneInput } from '@/components/buyer/auth/PhoneInput';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import {
  AUTH_LOGIN_COPY,
  buildInformSellerMessage,
  buildRequestAccessMessage,
  buildWhatsAppChatUrl,
  buildWhatsAppShareUrl,
} from '@/constants/auth-login-copy';

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const accountVerified = searchParams.get('verified') === '1';
  const prefillEmail = searchParams.get('email') ?? '';
  const requestedView = searchParams.get('view');

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
        setPhoneError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      if (data.registered) {
        shouldResetLoading = false;
        router.push(
          `/verify?ref_id=${encodeURIComponent(data.ref_id ?? '')}&phone=${encodeURIComponent(phoneNumber)}`,
        );
        return;
      }

      if (data.outcome === 'unregistered') {
        setResolution({ kind: 'unregistered' });
        return;
      }

      setResolution({
        kind: 'blocked',
        reason: data.outcome === 'buyer_disabled' ? 'buyer_disabled' : 'seller_disabled',
        sellerName: data.seller_name ?? 'this seller',
        sellerWhatsappNumber: data.seller_whatsapp_number,
        buyerName: data.buyer_name,
      });
    } catch {
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
          ...(posthog.get_distinct_id() && { 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() }),
          ...(posthog.get_session_id() && { 'X-POSTHOG-SESSION-ID': posthog.get_session_id() }),
        },
        body: JSON.stringify({ identifier, password }),
      });

      const data = (await res.json()) as SignInResponse;

      if (!res.ok) {
        setEmailError(data.error || 'Login failed');
        return;
      }

      if (data.pending_verification) {
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
        setEmailError('Session was not created');
        return;
      }

      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      posthog.identify(data.user?.id ?? identifier, { email: data.user?.email ?? identifier });

      shouldResetLoading = false;
      router.replace(data.redirect ?? '/dashboard');
      router.refresh();
    } catch {
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
    const message = buildInformSellerMessage({
      sellerName:
        resolution && resolution.kind === 'blocked'
          ? resolution.sellerName
          : 'your seller',
      signupLink,
      buyerName:
        resolution && resolution.kind === 'blocked'
          ? resolution.buyerName
          : null,
    });

    window.open(buildWhatsAppShareUrl(message), '_blank', 'noopener,noreferrer');
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls =
    'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

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

      {view === 'otp' ? (
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
                      {AUTH_LOGIN_COPY.resolution.unregistered.title}
                    </p>
                    {AUTH_LOGIN_COPY.resolution.unregistered.lines.map((line) => (
                      <p key={line} className="text-body-sm text-warning-700/90">
                        {line}
                      </p>
                    ))}
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
            <PhoneInput key={phoneFormKey} onSubmit={handlePhoneSubmit} loading={phoneLoading} error={phoneError} />
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

      <div className="mt-4 text-right">
        <p className="text-caption text-cream-600">
          New here?{' '}
          <Link href="/signup" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
            {AUTH_LOGIN_COPY.login.createSellerAccount}
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-56 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="mt-6 space-y-4">
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
