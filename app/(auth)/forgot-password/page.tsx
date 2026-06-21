'use client';

import { useState } from 'react';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';

const inputCls =
  'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
const labelCls =
  'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSent(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

      {sent ? (
        <div className="flex flex-col items-center text-center pt-2">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                stroke="var(--teal-500)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-h3 font-display text-cream-900 mb-1">Check your inbox</h2>
          <p className="text-body-sm text-cream-600 mb-6">
            If <strong>{email}</strong> is registered, you&apos;ll receive a password reset link
            shortly.
          </p>
          <Link
            href="/login"
            className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
          >
            ← Back to login
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-h3 font-display text-cream-900 mb-1">Forgot your password?</h1>
          <p className="text-body-sm text-cream-600 mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className={labelCls}
                style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                disabled={loading}
                required
                autoComplete="email"
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
              {loading ? 'Sending…' : 'Send reset link'}
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
        </>
      )}
    </div>
  );
}
