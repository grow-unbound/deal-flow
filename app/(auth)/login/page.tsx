'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PhoneInput } from '@/components/buyer/auth/PhoneInput';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import posthog from 'posthog-js';

function LoginForm() {
  const router = useRouter();

  // Phone OTP state (primary flow)
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [unregistered, setUnregistered] = useState(false);

  // Email/password toggle state (secondary flow)
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  async function handlePhoneSubmit(phoneNumber: string) {
    setPhoneError('');
    setUnregistered(false);
    setPhoneLoading(true);

    try {
      const res = await fetch('/api/auth/phone-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data: { ref_id: string | null; registered: boolean; message: string; error?: string } =
        await res.json();

      if (!res.ok) {
        setPhoneError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      if (!data.registered) {
        setUnregistered(true);
        return;
      }

      router.push(
        `/verify?ref_id=${encodeURIComponent(data.ref_id!)}&phone=${encodeURIComponent(phoneNumber)}`,
      );
    } catch {
      setPhoneError('Network error. Please check your connection and try again.');
    } finally {
      setPhoneLoading(false);
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

  const inputCls =
    'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls =
    'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Welcome back</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        Enter your mobile number to receive an OTP on WhatsApp.
      </p>

      {/* Primary: Phone OTP */}
      {unregistered ? (
        <div className="space-y-4">
          <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3">
            <p className="text-body-sm text-warning-700 font-medium">
              This number isn&apos;t registered. Contact your distributor.
            </p>
          </div>
          <button
            onClick={() => setUnregistered(false)}
            className="w-full px-4 py-2.5 rounded-md border border-cream-300 bg-white text-cream-800 text-body-sm font-semibold hover:bg-cream-50 transition-colors"
          >
            Try a different number
          </button>
        </div>
      ) : (
        <PhoneInput onSubmit={handlePhoneSubmit} loading={phoneLoading} error={phoneError} />
      )}

      {/* Secondary: Email + password toggle */}
      <div className="mt-6 pt-4 border-t border-cream-200">
        <button
          type="button"
          onClick={() => { setShowEmailForm((v) => !v); setEmailError(''); }}
          className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
        >
          {showEmailForm ? 'Hide email login' : 'Login with email instead →'}
        </button>

        {showEmailForm && (
          <form onSubmit={handleEmailSubmit} className="mt-4 space-y-4">
            <div>
              <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
                Email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setEmailError(''); }}
                disabled={emailLoading}
                required
                autoComplete="username"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
                Password
              </label>
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
              {emailLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>

      <div className="mt-4 text-right">
        <p className="text-caption text-cream-600">
          No account?{' '}
          <Link href="/signup" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
            Sign up
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
        <div className="h-4 w-40 rounded bg-cream-200 animate-pulse" />
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
