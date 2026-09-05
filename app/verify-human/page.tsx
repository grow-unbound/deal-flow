'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Turnstile } from '@marsidev/react-turnstile';
import { YuktiLogo } from '@/components/brand/YuktiLogo';

/** Same-origin-only — return_to rides through a URL param, so re-validate
 * client-side before navigating even though middleware only ever constructs
 * it from the current request's own URL. */
function safeReturnTo(raw: string | null): string {
  if (!raw) return '/';
  try {
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    const parsed = new URL(raw);
    if (parsed.origin === window.location.origin) return raw;
  } catch {
    // fall through
  }
  return '/';
}

function VerifyHumanInner() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('return_to'));
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function handleSuccess(token: string) {
    setError('');
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstile_token: token }),
      });
      if (!res.ok) {
        setError('Verification failed. Please try again.');
        setVerifying(false);
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setError('Network error. Please try again.');
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-cream-50 px-4">
      <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8 max-w-sm w-full text-center">
        <div className="mb-6 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
        </div>
        <h1 className="text-h3 font-display text-cream-900 mb-2">Quick check</h1>
        <p className="text-body-sm text-cream-600 mb-6">
          We noticed unusual traffic from your network. Please confirm you&apos;re human to continue.
        </p>
        {siteKey ? (
          <div className="flex justify-center">
            <Turnstile
              siteKey={siteKey}
              onSuccess={handleSuccess}
              onError={() => setError('Verification failed. Please refresh and try again.')}
              options={{ theme: 'light' }}
            />
          </div>
        ) : (
          <p className="text-caption text-cream-500">Verification is not configured — contact support.</p>
        )}
        {verifying && <p className="mt-3 text-caption text-cream-600">Verifying…</p>}
        {error && (
          <p className="mt-4 text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
        )}
      </div>
    </div>
  );
}

export default function VerifyHumanPage() {
  return (
    <Suspense fallback={null}>
      <VerifyHumanInner />
    </Suspense>
  );
}
