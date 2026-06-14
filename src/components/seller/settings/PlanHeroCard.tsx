'use client';

import { cn } from '@/lib/utils';
import type { PlanTier } from '@/constants/tier-limits';
import type { BillingLimits, BillingUsage } from '@/types/billing-settings';

const TIER_LABEL: Record<PlanTier, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
};

const TIER_SUB: Record<PlanTier, string> = {
  starter: 'Everything you need to get started.',
  growth: 'Higher limits for growing businesses.',
  scale: 'Unlimited limits for large operations.',
};

function meterPct(used: number, limit: number): number {
  if (limit === Number.POSITIVE_INFINITY) {
    return used > 0 ? 28 : 12;
  }
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function isWarn(used: number, limit: number): boolean {
  if (limit === Number.POSITIVE_INFINITY) return false;
  return limit > 0 && used / limit >= 0.8;
}

function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = meterPct(used, limit);
  const warn = isWarn(used, limit);
  const unlimited = limit === Number.POSITIVE_INFINITY;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-white/90">{label}</span>
        <span className="font-mono text-lg font-medium tabular-nums text-white">
          {used}
          {unlimited ? <span className="text-base font-normal text-white/70"> / ∞</span> : <span className="text-base font-normal text-white/70"> / {limit}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/20">
        <div
          className={cn('h-full rounded-full transition-all', warn ? 'bg-amber-300' : 'bg-white/60')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PlanHeroCard({ plan, usage, limits }: { plan: PlanTier; usage: BillingUsage; limits: BillingLimits }) {
  return (
    <section className="rounded-xl bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 p-6 text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-200/90">Current plan</p>
      <h2 className="mt-1 font-display text-3xl font-medium tracking-tight">{TIER_LABEL[plan]}</h2>
      <p className="mt-1 max-w-prose text-sm text-teal-100/90">{TIER_SUB[plan]}</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <Meter label="Cohorts" used={usage.cohorts} limit={limits.cohorts} />
        <Meter label="Price lists" used={usage.price_lists} limit={limits.price_lists} />
        <Meter label="Published catalogs" used={usage.catalogs} limit={limits.catalogs} />
      </div>
    </section>
  );
}
