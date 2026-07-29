export const TIER_LIMITS = {
  lite: { cohorts: 0, price_lists: 0, catalogs: 0, buyer_app_mau: 0, locations: 1 },
  starter: {
    cohorts: Number.POSITIVE_INFINITY,
    price_lists: Number.POSITIVE_INFINITY,
    catalogs: Number.POSITIVE_INFINITY,
    buyer_app_mau: 50,
    locations: 1,
  },
  growth: {
    cohorts: Number.POSITIVE_INFINITY,
    price_lists: Number.POSITIVE_INFINITY,
    catalogs: Number.POSITIVE_INFINITY,
    buyer_app_mau: 500,
    locations: 10,
  },
  scale: {
    cohorts: Number.POSITIVE_INFINITY,
    price_lists: Number.POSITIVE_INFINITY,
    catalogs: Number.POSITIVE_INFINITY,
    buyer_app_mau: Number.POSITIVE_INFINITY,
    locations: Number.POSITIVE_INFINITY,
  },
} as const;

export type PlanTier = keyof typeof TIER_LIMITS;
