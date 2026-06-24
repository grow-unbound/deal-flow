'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser } from '@/lib/supabase-browser';

const inputCls =
  'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
const labelCls =
  'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

export default function SetupPasswordPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // Hash fragment from Supabase old-style email links: #access_token=...&refresh_token=...
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    const bootstrap = async () => {
      if (accessToken && refreshToken) {
        // Explicitly call setSession — createClientComponentClient (cookie storage) does
        // NOT auto-process hash fragments the way localStorage-based clients do.
        await supabaseBrowser.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      } else if (code) {
        await supabaseBrowser.auth.exchangeCodeForSession(code);
        const clean = new URL(window.location.href);
        clean.searchParams.delete('code');
        window.history.replaceState({}, '', clean.toString());
      }

      const { data } = await supabaseBrowser.auth.getUser();
      if (!data.user) {
        setError('Your invite link has expired or is invalid. Please ask for a new invite.');
        return;
      }
      const name =
        (data.user.user_metadata?.full_name as string | undefined) ??
        data.user.email ??
        null;
      setDisplayName(name);
      setSessionReady(true);
    };

    void bootstrap();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabaseBrowser.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      const activateRes = await fetch('/api/auth/accept-invite', { method: 'POST' });
      if (!activateRes.ok) {
        const body = (await activateRes.json().catch(() => ({}))) as { error?: string };
        if (!body.error?.includes('No pending invite')) {
          setError(body.error ?? 'Could not activate your account. Please contact support.');
          return;
        }
      }

      await supabaseBrowser.auth.refreshSession();
      router.replace('/dashboard');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">
        Welcome{displayName ? `, ${displayName.split(' ')[0]}` : ' to Yukti'}
      </h1>
      <p className="text-body-sm text-cream-600 mb-6">
        You&apos;ve been invited to your distributor&apos;s workspace. Create a password to get started.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
            Password
          </label>
          <input
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            disabled={loading || !sessionReady}
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
            Confirm password
          </label>
          <input
            type="password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
            disabled={loading || !sessionReady}
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

        {error && (
          <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !sessionReady}
          className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Setting up your account…' : !sessionReady && !error ? 'Verifying link…' : 'Set password & continue'}
        </button>
      </form>

      <div className="mt-4 text-right">
        <p className="text-caption text-cream-600">
          Already have an account?{' '}
          <Link href="/login" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
