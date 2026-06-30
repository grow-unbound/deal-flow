'use client';

import { useEffect, useState } from 'react';

const EXPIRY_CHECK_MS = 30_000;
const EXPIRY_WARNING_BEFORE_S = 120;

function getPreviewExpFromCookie(): number | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)buyer_preview_exp=([^;]*)/);
  if (!match) return null;
  const exp = parseInt(match[1], 10);
  return Number.isNaN(exp) ? null : exp;
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-surface)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
    </div>
  );
}

export { Spinner };

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
          className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
        >
          Return to seller app
        </button>
      </div>
    </div>
  );
}

export function BuyerPreviewBootstrap({ children }: { children: React.ReactNode }) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    function checkExpiry() {
      const exp = getPreviewExpFromCookie();
      if (exp === null) return;
      const nowS = Math.floor(Date.now() / 1000);
      if (nowS >= exp - EXPIRY_WARNING_BEFORE_S) {
        setExpired(true);
      }
    }
    checkExpiry();
    const id = setInterval(checkExpiry, EXPIRY_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {children}
      {expired && (
        <PreviewExpiredOverlay
          onRefresh={() => {
            window.close();
            window.location.href = '/login';
          }}
        />
      )}
    </>
  );
}
