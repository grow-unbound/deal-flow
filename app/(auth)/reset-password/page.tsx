'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser } from '@/lib/supabase-browser';

const inputCls =
  'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
const labelCls =
  'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

      await supabaseBrowser.auth.signOut();
      router.replace('/login?reset=success');
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

      <h1 className="text-h3 font-display text-cream-900 mb-1">Set a new password</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        Choose a strong password for your Yukti account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls} style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}>
            New password
          </label>
          <input
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            disabled={loading}
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
            disabled={loading}
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
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving…' : 'Reset password'}
        </button>
      </form>

      <div className="mt-4 text-right">
        <Link
          href="/login"
          className="text-caption text-cream-500 hover:text-cream-700 transition-colors"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
