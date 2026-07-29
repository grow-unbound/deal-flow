'use client';

import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PlanTier } from '@/constants/tier-limits';

function nextTier(plan: PlanTier): PlanTier | null {
  if (plan === 'lite') return 'starter';
  if (plan === 'starter') return 'growth';
  if (plan === 'growth') return 'scale';
  return null;
}

const COPY: Record<
  Exclude<PlanTier, 'scale'>,
  { title: string; body: string; cta: string; border: string; bg: string }
> = {
  lite: {
    title: 'Upgrade to Starter',
    body: 'Unlock the buyer app, campaign publishing, and unlimited cohorts, price lists, and catalogs.',
    cta: 'Upgrade to Starter',
    border: 'border-teal-200',
    bg: 'from-teal-50 to-white',
  },
  starter: {
    title: 'Upgrade to Growth',
    body: 'Get up to 500 buyer app monthly active users and 10 locations — same features, higher limits.',
    cta: 'Upgrade to Growth',
    border: 'border-ember-200',
    bg: 'from-ember-50 to-white',
  },
  growth: {
    title: 'Upgrade to Scale',
    body: 'Unlimited buyer app monthly active users and locations for large distributor operations.',
    cta: 'Upgrade to Scale',
    border: 'border-violet-200',
    bg: 'from-violet-50 to-white',
  },
};

export function UpgradePlanCard({
  currentPlan,
  onChooseUpgrade,
}: {
  currentPlan: PlanTier;
  onChooseUpgrade: (target: PlanTier) => void;
}) {
  const target = nextTier(currentPlan);
  if (!target || currentPlan === 'scale') {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-5 py-4 text-body-sm text-teal-900">
        <p className="font-semibold">You are on our highest tier</p>
        <p className="mt-1 text-teal-800/90">Scale includes unlimited limits for cohorts, price lists, and catalogs.</p>
      </div>
    );
  }
  const meta = COPY[currentPlan];
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${meta.border} ${meta.bg} px-5 py-4 shadow-xs sm:flex sm:items-center sm:justify-between sm:gap-6`}
    >
      <div>
        <p className="font-display text-base font-semibold text-cream-900">{meta.title}</p>
        <p className="mt-1 max-w-prose text-body-sm text-cream-700">{meta.body}</p>
      </div>
      <Button type="button" className="mt-4 shrink-0 sm:mt-0" onClick={() => onChooseUpgrade(target)}>
        <ArrowUpRight className="mr-2 h-4 w-4" />
        {meta.cta}
      </Button>
    </div>
  );
}
