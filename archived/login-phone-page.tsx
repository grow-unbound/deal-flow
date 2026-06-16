'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PhoneInput } from '@/components/buyer/auth/PhoneInput';
import { YuktiLogo } from '@/components/brand/YuktiLogo';

function PhoneLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [unregistered, setUnregistered] = useState(false);

  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setInfo('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  async function handleSubmit(phoneNumber: string) {
    setError('');
    setInfo('');
    setUnregistered(false);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/phone-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data: {
        ref_id: string | null;
        registered: boolean;
        message: string;
        error?: string;
      } = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      if (!data.registered) {
        setUnregistered(true);
        return;
      }

      // Navigate to OTP verification
      router.push(
        `/verify?ref_id=${encodeURIComponent(data.ref_id!)}&phone=${encodeURIComponent(phoneNumber)}`
      );
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

      <h1 className="text-h3 font-display text-cream-900 mb-1">Buyer login</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        Enter your registered mobile number to receive an OTP.
      </p>

      {info ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-body-sm font-medium text-amber-800">{info}</p>
        </div>
      ) : null}

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
        <PhoneInput onSubmit={handleSubmit} loading={loading} error={error} />
      )}

      <div className="mt-6 pt-4 border-t border-cream-200 text-center">
        <p className="text-caption text-cream-600">
          Seller account?{' '}
          <Link href="/login" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
            Sign in here →
          </Link>
        </p>
      </div>
    </div>
  );
}

function PhoneLoginFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="h-4 w-32 rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-56 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
        <div className="h-10 w-full rounded bg-cream-200 animate-pulse" />
      </div>
    </div>
  );
}

export default function PhoneLoginPage() {
  return (
    <Suspense fallback={<PhoneLoginFallback />}>
      <PhoneLoginForm />
    </Suspense>
  );
}
