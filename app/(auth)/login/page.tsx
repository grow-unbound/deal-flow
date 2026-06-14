'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import posthog from 'posthog-js';

function isPhone(value: string) {
  return /^[0-9]{10}$/.test(value.trim());
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setInfo('Account created! Check your email to confirm, then sign in.');
      return;
    }
    if (searchParams.get('reason') === 'session_expired') {
      setInfo('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  const phoneEntered = isPhone(identifier);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phoneEntered) {
      setError('Phone login requires OTP. Use "Login with OTP" below.');
      return;
    }
    setError('');
    setLoading(true);
    let shouldResetLoading = true;

    try {
      type SignInResponse = {
        error?: string;
        redirect?: string;
        user?: { id: string; email: string };
        session?: {
          access_token: string;
          refresh_token: string;
        };
      };

      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(posthog.get_distinct_id() && { 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() }),
          ...(posthog.get_session_id() && { 'X-POSTHOG-SESSION-ID': posthog.get_session_id() }),
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      const signInData = (await res.json()) as SignInResponse;

      if (!res.ok) {
        setError(signInData.error || 'Login failed');
        return;
      }

      if (!signInData.session?.access_token || !signInData.session?.refresh_token) {
        setError('Session was not created');
        return;
      }

      await supabase.auth.setSession({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });

      posthog.identify(signInData.user?.id ?? identifier, {
        email: signInData.user?.email ?? identifier,
      });

      shouldResetLoading = false;
      router.replace(signInData.redirect ?? '/dashboard');
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      if (shouldResetLoading) setLoading(false);
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
      <p className="text-body-sm text-cream-600 mb-6">Sign in to your account</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
            Email or phone
          </label>
          <input
            type="text"
            placeholder="you@company.com or 9876543210"
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
            disabled={loading}
            required
            autoComplete="username"
            className={inputCls}
          />
        </div>

        {!phoneEntered && (
          <div>
            <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>
        )}

        {info && (
          <p className="text-caption text-teal-700 bg-teal-50 px-3 py-2 rounded-md">{info}</p>
        )}
        {error && (
          <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
        )}

        {phoneEntered ? (
          <Link
            href="/login/otp"
            className="flex items-center justify-center w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base"
          >
            Continue with OTP
          </Link>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </form>

      <div className="mt-4 pt-4 border-t border-cream-200 flex items-center justify-between">
        <Link
          href="/login/otp"
          className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
        >
          Login with OTP →
        </Link>
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
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
      </div>
    </div>
  );
}

// Wrap in Suspense — useSearchParams() requires it in Next.js App Router
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
