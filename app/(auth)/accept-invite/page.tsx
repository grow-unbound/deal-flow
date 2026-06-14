'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { YuktiLogo } from '@/components/brand/YuktiLogo';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function activate() {
      try {
        const res = await fetch('/api/auth/accept-invite', { method: 'POST' });
        if (res.ok) {
          setStatus('success');
          setTimeout(() => router.push('/dashboard'), 1500);
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setErrorMsg(body.error ?? 'Invite link invalid or expired.');
          setStatus('error');
        }
      } catch {
        setErrorMsg('Something went wrong. Please try again.');
        setStatus('error');
      }
    }
    void activate();
  }, [router]);

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="bg-cream-100 rounded-lg shadow-sm p-8 max-w-sm w-full text-center">
        <YuktiLogo variant="stacked-lockup" className="mx-auto mb-5 h-14 w-[76px]" priority />

        {status === 'loading' && (
          <>
            <h2 className="font-display text-h3 text-cream-900 mb-2">
              Activating your account…
            </h2>
            <p className="text-body-sm text-cream-600">Just a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="font-display text-h3 text-cream-900 mb-2">
              Welcome to Yukti
            </h2>
            <p className="text-body-sm text-cream-600">
              Redirecting to your dashboard…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="font-display text-h3 text-cream-900 mb-2">
              Invite not found
            </h2>
            <p className="text-body-sm text-cream-600">{errorMsg}</p>
            <Link
              href="/login"
              className="inline-block mt-4 text-caption text-teal-500 underline"
            >
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
