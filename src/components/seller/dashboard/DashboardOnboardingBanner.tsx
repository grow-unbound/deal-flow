'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';

interface DashboardOnboardingBannerProps {
  tenantId: string | null;
}

export function DashboardOnboardingBanner({ tenantId }: DashboardOnboardingBannerProps) {
  const searchParams = useSearchParams();
  const captureEvent = useCaptureEvent();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const fromSignup = searchParams.get('first_run') === '1';
    const seen = localStorage.getItem('df_first_run') === 'seen';
    setShowOnboarding(fromSignup || !seen);
  }, [searchParams]);

  useEffect(() => {
    captureEvent('dashboard_viewed', { tenant_id: tenantId });
  }, [captureEvent, tenantId]);

  if (!showOnboarding) return null;

  return (
    <div
      role="banner"
      className="fixed top-[var(--topbar-h)] left-[var(--sidebar-w)] right-0 z-20 bg-teal-500 px-6 py-3 text-cream-50 flex items-center gap-3"
      data-testid="onboarding-banner"
    >
      <Sparkles className="h-4 w-4 shrink-0" />
      <p className="font-sans text-body-sm flex-1">
        <span className="font-semibold">Welcome to DealFlow!</span>{' '}
        Complete your setup to start selling - add your first brand and invite your team.
      </p>
      <Link
        href="/settings"
        className="font-sans text-body-sm font-semibold underline underline-offset-2 hover:text-cream-200 transition-colors shrink-0"
      >
        Set up now
      </Link>
      <button
        onClick={() => {
          localStorage.setItem('df_first_run', 'seen');
          setShowOnboarding(false);
        }}
        aria-label="Dismiss welcome banner"
        className="ml-2 p-1 rounded hover:bg-teal-600 transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
