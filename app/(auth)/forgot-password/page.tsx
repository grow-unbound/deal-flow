'use client';

import { useState } from 'react';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-[var(--cream-100)] border border-[var(--border-1)] text-[var(--cream-900)] placeholder:text-[var(--cream-500)] text-sm focus:outline-none focus:border-[var(--teal-500)] focus:ring-2 focus:ring-[var(--teal-500)]/20 transition-colors disabled:opacity-50';

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
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg-page, var(--cream-50))' }}
    >
      {/* Hero */}
      <div
        className="relative flex shrink-0 flex-col items-center justify-end px-6 pb-10 pt-16"
        style={{
          minHeight: '42vh',
          background: 'linear-gradient(160deg, #1F3A34 0%, #2D5549 60%, #3A6B5A 100%)',
        }}
      >
        <YuktiLogo variant="stacked-lockup" theme="dark" className="mb-6 opacity-90" />
      </div>

      {/* Card */}
      <div
        className="relative mx-auto flex w-full max-w-md flex-1 flex-col rounded-t-3xl px-6 pb-10 pt-8"
        style={{ background: '#fff', marginTop: -20, boxShadow: '0 -4px 24px rgba(0,0,0,0.08)' }}
      >
        {sent ? (
          <div className="flex flex-col items-center text-center pt-4">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'var(--cream-100)' }}
            >
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
            <h2
              className="mb-2 font-display text-xl font-bold"
              style={{ color: 'var(--cream-900)' }}
            >
              Check your inbox
            </h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--cream-600)' }}>
              If <strong>{email}</strong> is registered, you&apos;ll receive a password reset link
              shortly.
            </p>
            <Link
              href="/login"
              className="text-sm font-medium"
              style={{ color: 'var(--teal-500)' }}
            >
              ← Back to login
            </Link>
          </div>
        ) : (
          <>
            <h2
              className="mb-1 font-display text-xl font-bold"
              style={{ color: 'var(--cream-900)' }}
            >
              Forgot your password?
            </h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--cream-600)' }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--cream-700)' }}
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
                <p
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: '#FEE2E2', color: '#B91C1C' }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--teal-500)' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="text-xs font-medium"
                style={{ color: 'var(--cream-500)' }}
              >
                ← Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
