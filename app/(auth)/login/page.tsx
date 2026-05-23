'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
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

    try {
      // Step 1: Authenticate with Supabase — sets session in browser automatically
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      });

      if (authError || !authData.user) {
        setError('Invalid email or password');
        return;
      }

      // Step 2: Get workspace + role from server (also fires PostHog)
      const res = await fetch('/api/auth/workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(posthog.get_distinct_id() && { 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() }),
          ...(posthog.get_session_id() && { 'X-POSTHOG-SESSION-ID': posthog.get_session_id() }),
        },
        body: JSON.stringify({
          user_id: authData.user.id,
          email: authData.user.email,
          access_token: authData.session?.access_token,
        }),
      });

      const wsData = await res.json();

      if (!res.ok) {
        // Workspace lookup failed — sign out to keep state clean
        await supabase.auth.signOut();
        setError(wsData.error || 'Login failed');
        return;
      }

      router.push(wsData.redirect ?? '/dashboard');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls =
    'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
          <span className="text-cream-50 font-display font-medium text-sm">DF</span>
        </div>
        <span className="font-display font-medium text-teal-500 text-xl">DealFlow</span>
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Welcome back</h1>
      <p className="text-body-sm text-cream-600 mb-6">Sign in to your account</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
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
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
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

// Wrap in Suspense — useSearchParams() requires it in Next.js App Router
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
