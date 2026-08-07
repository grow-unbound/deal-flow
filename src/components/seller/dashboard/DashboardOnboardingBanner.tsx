'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';
import { shouldShowTenantOnboardingBanner } from '@/lib/seller-onboarding-banner';

interface DashboardOnboardingBannerProps {
  tenantId: string | null;
  isTenantCreator: boolean;
  dismissedAt: string | null;
}

export function DashboardOnboardingBanner({
  tenantId,
  isTenantCreator,
  dismissedAt,
}: DashboardOnboardingBannerProps) {
  const searchParams = useSearchParams();
  const captureEvent = useCaptureEvent();
  const [showOnboarding, setShowOnboarding] = useState(() =>
    shouldShowTenantOnboardingBanner({
      isTenantCreator,
      tenantId,
      dismissedAt,
    }),
  );
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    setShowOnboarding(
      shouldShowTenantOnboardingBanner({
        isTenantCreator,
        tenantId,
        dismissedAt,
      }),
    );
  }, [dismissedAt, isTenantCreator, tenantId]);

  // Legacy signup/login still appends ?first_run=1 — strip it so the URL stays clean.
  useEffect(() => {
    if (searchParams.get('first_run') !== '1') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('first_run');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [searchParams]);

  useEffect(() => {
    captureEvent('dashboard_viewed', { tenant_id: tenantId });
  }, [captureEvent, tenantId]);

  if (!showOnboarding || !tenantId) return null;

  async function dismissBanner(): Promise<void> {
    if (dismissing) return;
    setDismissing(true);
    setShowOnboarding(false);

    try {
      const res = await fetch('/api/tenant/onboarding-banner/dismiss', { method: 'POST' });
      if (!res.ok) {
        setShowOnboarding(true);
      }
    } catch {
      setShowOnboarding(true);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div
      role="banner"
      className="fixed top-[var(--topbar-h)] left-[var(--sidebar-w)] right-0 z-20 flex items-center gap-3 bg-teal-500 px-6 py-3 text-[var(--fg-inverse)]"
      data-testid="onboarding-banner"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--fg-inverse)]" aria-hidden />
      <p className="flex-1 font-sans text-body-sm text-[var(--fg-inverse)]">
        <span className="font-semibold">Welcome to Yukti!</span>{' '}
        Set up your workspace, import your data, or connect your ERP tools to get started.
      </p>
      <Link
        href="/settings"
        onClick={() => {
          void dismissBanner();
        }}
        className="shrink-0 font-sans text-body-sm font-semibold text-[var(--fg-inverse)] underline underline-offset-2 transition-opacity hover:opacity-80"
      >
        Set up now
      </Link>
      <button
        type="button"
        onClick={() => {
          void dismissBanner();
        }}
        disabled={dismissing}
        aria-label="Dismiss welcome banner"
        className="ml-2 shrink-0 rounded p-1 text-[var(--fg-inverse)] transition-colors hover:bg-white/10 disabled:opacity-60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
