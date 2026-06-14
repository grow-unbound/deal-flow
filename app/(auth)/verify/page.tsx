'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { OtpForm } from '@/components/buyer/auth/OtpForm';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser } from '@/lib/supabase-browser';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

interface BuyerContext {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  buyer_id: string;
  role: string;
}

interface SessionPayload {
  access_token: string;
  refresh_token: string;
}

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref_id = searchParams.get('ref_id') ?? '';
  const phone = searchParams.get('phone') ?? '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Guard: if no ref_id, redirect back to phone entry
  useEffect(() => {
    if (!ref_id) {
      router.replace('/login/phone');
    }
  }, [ref_id, router]);

  async function handleSubmit(otp: string) {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_id, otp }),
      });

      const data: {
        success?: boolean;
        redirect?: string;
        contexts?: BuyerContext[];
        ref_id?: string;
        session?: SessionPayload;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Verification failed. Please try again.');
        return;
      }

      if (data.contexts && data.contexts.length > 1 && data.ref_id) {
        // Multiple tenants — let user pick
        try {
          sessionStorage.setItem(SESSION_CONTEXTS_KEY, JSON.stringify(data.contexts));
        } catch {
          // sessionStorage may be unavailable in some environments
        }
        router.push(`/login/select-context?ref_id=${encodeURIComponent(data.ref_id)}`);
        return;
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        await supabaseBrowser.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      router.replace(data.redirect ?? '/shop');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!ref_id) return null; // redirecting

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Enter OTP</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        We sent a 6-digit code to your WhatsApp.
      </p>

      <OtpForm
        phone={phone}
        onSubmit={handleSubmit}
        loading={loading}
        error={error}
      />

      <div className="mt-6 pt-4 border-t border-cream-200 flex items-center justify-between">
        <Link
          href="/login/phone"
          className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
        >
          ← Change number
        </Link>
        <button
          type="button"
          onClick={() => router.push(`/login/phone`)}
          className="text-caption text-cream-600 hover:text-cream-800 transition-colors"
        >
          Resend OTP
        </button>
      </div>
    </div>
  );
}

function VerifyOtpFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="h-4 w-32 rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-48 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="flex gap-2 justify-between">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-10 h-12 rounded bg-cream-200 animate-pulse" />
        ))}
      </div>
      <div className="mt-4 h-10 w-full rounded bg-cream-200 animate-pulse" />
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyOtpFallback />}>
      <VerifyOtpForm />
    </Suspense>
  );
}
