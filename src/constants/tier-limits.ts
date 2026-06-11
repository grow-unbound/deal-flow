export const TIER_LIMITS = {
  starter: { cohorts: 5, price_lists: 2, catalogs: 3 },
  growth: { cohorts: 20, price_lists: 10, catalogs: 15 },
  scale: { cohorts: Number.POSITIVE_INFINITY, price_lists: Number.POSITIVE_INFINITY, catalogs: Number.POSITIVE_INFINITY },
} as const;

export type PlanTier = keyof typeof TIER_LIMITS;
