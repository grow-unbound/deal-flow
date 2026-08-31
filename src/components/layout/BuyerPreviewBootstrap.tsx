'use client';

import { useEffect, useRef, useState } from 'react';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';
import {
  BUYER_PREVIEW_ACTIVITY_REFRESH_BUFFER_SECONDS,
  BUYER_PREVIEW_CONFIRMATION_COOKIE,
  BUYER_PREVIEW_INACTIVITY_SECONDS,
} from '@/lib/buyer-preview';

const INACTIVITY_MS = BUYER_PREVIEW_INACTIVITY_SECONDS * 1000;
const EXPIRY_CHECK_MS = 30_000;
const REFRESH_THROTTLE_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

function getPreviewExpFromCookie(): number | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)buyer_preview_exp=([^;]*)/);
  if (!match) return null;
  const exp = parseInt(match[1], 10);
  return Number.isNaN(exp) ? null : exp;
}

function isPreviewSession(): boolean {
  return getPreviewExpFromCookie() !== null;
}

function getPreviewConfirmationFlag(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes(`${BUYER_PREVIEW_CONFIRMATION_COOKIE}=1`);
}

function clearPreviewConfirmationFlag(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${BUYER_PREVIEW_CONFIRMATION_COOKIE}=; Max-Age=0; path=/`;
}

function Spinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-surface)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
    </div>
  );
}

export { Spinner };

function PreviewExpiredOverlay({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="mb-1 text-base font-semibold text-gray-900">Buyer preview ended</p>
        <p className="mb-5 text-sm text-gray-500">
          Your seller preview closed after a period of inactivity. Return to the seller app and click
          &quot;Open buyer app&quot; again.
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

function PreviewConfirmationOverlay({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="mb-1 text-base font-semibold text-gray-900">
          {AUTH_LOGIN_COPY.resolution.previewMode.title}
        </p>
        <p className="mb-5 text-sm text-gray-500">
          {AUTH_LOGIN_COPY.resolution.previewMode.body}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-cream-300 bg-white px-4 py-2.5 text-sm font-semibold text-cream-700 transition-colors hover:bg-cream-50"
          >
            {AUTH_LOGIN_COPY.resolution.previewMode.cancel}
          </button>
          <button
            onClick={onContinue}
            className="flex-1 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
          >
            {AUTH_LOGIN_COPY.resolution.previewMode.continue}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuyerPreviewBootstrap({ children }: { children: React.ReactNode }) {
  const [expired, setExpired] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(0);
  const activityThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPreviewSession()) return;
    setNeedsConfirmation(getPreviewConfirmationFlag());

    async function maybeRefreshPreviewToken(): Promise<void> {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;

      const exp = getPreviewExpFromCookie();
      if (exp === null) return;

      const nowS = Math.floor(now / 1000);
      if (exp - nowS > BUYER_PREVIEW_ACTIVITY_REFRESH_BUFFER_SECONDS) return;

      lastRefreshRef.current = now;
      try {
        await fetch('/api/buyer/preview/refresh', { method: 'POST', credentials: 'include' });
      } catch {
        // Keep the inactivity timer authoritative; refresh is best-effort.
      }
    }

    function recordActivity(): void {
      lastActivityRef.current = Date.now();
      void maybeRefreshPreviewToken();
    }

    function onActivity(): void {
      if (activityThrottleRef.current) return;
      activityThrottleRef.current = setTimeout(() => {
        activityThrottleRef.current = null;
      }, ACTIVITY_THROTTLE_MS);
      recordActivity();
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        recordActivity();
      }
    }

    for (const eventName of ACTIVITY_EVENTS) {
      document.addEventListener(eventName, onActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    function checkInactivity(): void {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        setExpired(true);
      }
    }

    checkInactivity();
    const id = setInterval(checkInactivity, EXPIRY_CHECK_MS);

    return () => {
      clearInterval(id);
      if (activityThrottleRef.current) {
        clearTimeout(activityThrottleRef.current);
      }
      for (const eventName of ACTIVITY_EVENTS) {
        document.removeEventListener(eventName, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <>
      {children}
      {needsConfirmation && !expired && (
        <PreviewConfirmationOverlay
          onCancel={() => {
            clearPreviewConfirmationFlag();
            window.close();
            window.location.href = '/login';
          }}
          onContinue={() => {
            clearPreviewConfirmationFlag();
            setNeedsConfirmation(false);
          }}
        />
      )}
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
