'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { TIER_LIMITS, type PlanTier } from '@/constants/tier-limits';

export type TierLimitResource = 'cohorts' | 'price_lists' | 'catalogs';

const LABELS: Record<TierLimitResource, { noun: string }> = {
  cohorts: { noun: 'customer groups' },
  price_lists: { noun: 'price lists' },
  catalogs: { noun: 'published campaigns' },
};

export interface TierLimitWarningBannerProps {
  plan: PlanTier;
  resource: TierLimitResource;
  used: number;
}

export function TierLimitWarningBanner({ plan, resource, used }: TierLimitWarningBannerProps) {
  const limit = TIER_LIMITS[plan][resource];
  if (limit === Number.POSITIVE_INFINITY) return null;
  if (used / limit < 0.8) return null;

  const { noun } = LABELS[resource];
  const upgrade =
    plan === 'starter'
      ? 'Upgrade to Growth for higher limits.'
      : plan === 'growth'
        ? 'Upgrade to Scale for unlimited usage.'
        : null;
  if (!upgrade) return null;

  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p>
        You&apos;ve used <strong>{used}</strong> of <strong>{limit}</strong> {noun} on your{' '}
        <span className="capitalize">{plan}</span> plan.{' '}
        <Link href="/settings/billing" className="font-semibold text-amber-900 underline-offset-2 hover:underline">
          {upgrade}
        </Link>
      </p>
    </div>
  );
}
