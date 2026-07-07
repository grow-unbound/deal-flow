'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';
import {
  shouldShowTenantOnboardingBanner,
  tenantFirstRunStorageKey,
} from '@/lib/seller-onboarding-banner';

interface DashboardOnboardingBannerProps {
  tenantId: string | null;
  isTenantCreator: boolean;
}

export function DashboardOnboardingBanner({
  tenantId,
  isTenantCreator,
}: DashboardOnboardingBannerProps) {
  const searchParams = useSearchParams();
  const captureEvent = useCaptureEvent();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setShowOnboarding(false);
      return;
    }

    const storageKey = tenantFirstRunStorageKey(tenantId);
    const seen = localStorage.getItem(storageKey) === 'seen';
    const visible = shouldShowTenantOnboardingBanner({
      isTenantCreator,
      tenantId,
      firstRunParam: searchParams.get('first_run'),
      storageSeen: seen,
    });
    setShowOnboarding(visible);

    if (searchParams.get('first_run') === '1') {
      const url = new URL(window.location.href);
      url.searchParams.delete('first_run');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, [searchParams, isTenantCreator, tenantId]);

  useEffect(() => {
    captureEvent('dashboard_viewed', { tenant_id: tenantId });
  }, [captureEvent, tenantId]);

  if (!showOnboarding || !tenantId) return null;

  const storageKey = tenantFirstRunStorageKey(tenantId);

  function dismissBanner(): void {
    localStorage.setItem(storageKey, 'seen');
    setShowOnboarding(false);
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
        onClick={dismissBanner}
        className="shrink-0 font-sans text-body-sm font-semibold text-[var(--fg-inverse)] underline underline-offset-2 transition-opacity hover:opacity-80"
      >
        Set up now
      </Link>
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="Dismiss welcome banner"
        className="ml-2 shrink-0 rounded p-1 text-[var(--fg-inverse)] transition-colors hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
