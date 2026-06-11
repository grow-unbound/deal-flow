import { TIER_LIMITS, type PlanTier } from '@/constants/tier-limits';
import type { BillingLimits, BillingSettingsView, BillingUsage, BillingWarning } from '@/types/billing-settings';

export function normalizePlanTier(plan: string): PlanTier {
  if (plan === 'growth' || plan === 'scale' || plan === 'starter') return plan;
  return 'starter';
}

function limitForTier(tier: PlanTier): BillingLimits {
  const row = TIER_LIMITS[tier];
  return {
    cohorts: row.cohorts,
    price_lists: row.price_lists,
    catalogs: row.catalogs,
  };
}

function buildWarnings(usage: BillingUsage, limits: BillingLimits): BillingWarning[] {
  const keys: (keyof BillingUsage)[] = ['cohorts', 'price_lists', 'catalogs'];
  const labels: Record<keyof BillingUsage, string> = {
    cohorts: 'Cohorts',
    price_lists: 'Price lists',
    catalogs: 'Published catalogs',
  };
  const out: BillingWarning[] = [];
  for (const key of keys) {
    const lim = limits[key];
    if (lim === Number.POSITIVE_INFINITY) continue;
    const used = usage[key];
    if (lim > 0 && used / lim >= 0.8) {
      out.push({
        key,
        used,
        limit: lim,
        message: `${labels[key]}: you've used ${used} of ${lim} (${Math.round((used / lim) * 100)}%).`,
      });
    }
  }
  return out;
}

export function buildBillingView(args: {
  plan: string;
  usage: BillingUsage;
  whatsappBalance: number;
  whatsappPurchased: number;
}): BillingSettingsView {
  const plan = normalizePlanTier(args.plan);
  const limits = limitForTier(plan);
  return {
    plan,
    usage: args.usage,
    limits,
    whatsapp: {
      balance: args.whatsappBalance,
      purchased: Math.max(args.whatsappPurchased, 1),
    },
    warnings: buildWarnings(args.usage, limits),
  };
}
