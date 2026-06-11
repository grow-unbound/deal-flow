import { TIER_LIMITS, type PlanTier } from '@/constants/tier-limits';

const TIER_ORDER = { starter: 0, growth: 1, scale: 2 } as const;

export function meetsRequiredTier(
  tenantTier: keyof typeof TIER_ORDER,
  requiredTier: keyof typeof TIER_ORDER,
): boolean {
  return TIER_ORDER[tenantTier] >= TIER_ORDER[requiredTier];
}

export function getRemainingLimit(
  tenantTier: PlanTier,
  resource: keyof (typeof TIER_LIMITS)['starter'],
  currentCount: number,
): number {
  const limit = TIER_LIMITS[tenantTier][resource];
  if (limit === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return limit - currentCount;
}
