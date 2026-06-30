'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BUYER_PREVIEW_QUERY_PARAM,
  verifyBuyerPreviewToken,
} from '@/lib/buyer-preview';
import {
  clearStoredBuyerPreviewToken,
  getStoredBuyerPreviewToken,
  setStoredBuyerPreviewToken,
} from '@/lib/auth-session';

const EXPIRY_CHECK_MS = 30_000;
const EXPIRY_WARNING_BEFORE_S = 120;

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-surface)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
    </div>
  );
}

function PreviewExpiredOverlay({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="mb-1 text-base font-semibold text-gray-900">Buyer preview expired</p>
        <p className="mb-5 text-sm text-gray-500">
          Your seller preview session has timed out. Return to the seller app and click &quot;Open buyer app&quot; again.
        </p>
        <button
          onClick={onRefresh}
          className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition-colors"
        >
          Return to seller app
        </button>
      </div>
    </div>
  );
}

function BuyerPreviewBootstrapInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewToken = searchParams.get(BUYER_PREVIEW_QUERY_PARAM);
  const [ready, setReady] = useState(previewToken === null);
  const [expired, setExpired] = useState(false);
  const processedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!previewToken) {
      processedTokenRef.current = null;
      setReady(true);
      return;
    }

    if (processedTokenRef.current === previewToken) {
      return;
    }

    processedTokenRef.current = previewToken;
    setReady(false);
    setStoredBuyerPreviewToken(previewToken);

    const params = new URLSearchParams(searchParams.toString());
    params.delete(BUYER_PREVIEW_QUERY_PARAM);
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, previewToken, router, searchParams]);

  useEffect(() => {
    if (pathname.startsWith('/login')) {
      clearStoredBuyerPreviewToken();
    }
  }, [pathname]);

  // Periodically check stored token expiry; show overlay when expired.
  useEffect(() => {
    async function checkExpiry() {
      const stored = getStoredBuyerPreviewToken();
      if (!stored) return;
      const nowS = Math.floor(Date.now() / 1000);
      const payload = await verifyBuyerPreviewToken(stored, nowS + EXPIRY_WARNING_BEFORE_S);
      if (!payload) {
        setExpired(true);
      }
    }

    void checkExpiry();
    const id = setInterval(() => { void checkExpiry(); }, EXPIRY_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  if (!ready) return <Spinner />;

  return (
    <>
      {children}
      {expired && (
        <PreviewExpiredOverlay
          onRefresh={() => {
            clearStoredBuyerPreviewToken();
            window.close();
          }}
        />
      )}
    </>
  );
}

export function BuyerPreviewBootstrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <BuyerPreviewBootstrapInner>{children}</BuyerPreviewBootstrapInner>
    </Suspense>
  );
}
