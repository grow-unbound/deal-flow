import { TIER_LIMITS, type PlanTier } from '@/constants/tier-limits';
import type {
  BillingLimits,
  BillingSettingsView,
  BillingUsage,
  BillingWarning,
  WhatsAppUsageHistoryEntry,
} from '@/types/billing-settings';

export function normalizePlanTier(plan: string): PlanTier {
  if (plan === 'lite' || plan === 'growth' || plan === 'scale' || plan === 'starter') return plan;
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

// Low-balance banner reuses the ≥80%-usage warning threshold already
// established in buildWarnings() below (§6 point 5: "inherits the
// ≥80%-usage warning pattern already speced for tier limits").
const LOW_BALANCE_USAGE_THRESHOLD = 0.8;

// Human-readable labels for the trigger_source/meta_category values stored
// on app.whatsapp_messages (§4.3). Phase E's app.whatsapp_broadcasts table
// will let usage history group by actual broadcast name instead — until
// then this is the closest readable "use case" grouping available.
const TRIGGER_SOURCE_LABELS: Record<string, string> = {
  otp_login: 'Login OTP',
  order_placed: 'Order confirmation',
  dispatch_notice: 'Dispatch notice',
  broadcast: 'Broadcast',
};

function labelForUsageRow(triggerSource: string, metaCategory: string): string {
  return TRIGGER_SOURCE_LABELS[triggerSource] ?? `${metaCategory.charAt(0).toUpperCase()}${metaCategory.slice(1)} message`;
}

interface RawWhatsAppMessageRow {
  sent_at: string | null;
  created_at: string;
  trigger_source: string;
  meta_category: string;
  credits_charged: number | string | null;
}

/**
 * Groups raw app.whatsapp_messages rows into daily usage-history entries by
 * (date, trigger_source, meta_category) — see §6 point 3. Broadcast-level
 * grouping (by broadcast name) lands in Phase E once app.whatsapp_broadcasts
 * exists; for now trigger_source/meta_category is the closest available
 * "use case" dimension.
 */
export function buildWhatsAppUsageHistory(rows: RawWhatsAppMessageRow[]): WhatsAppUsageHistoryEntry[] {
  const buckets = new Map<string, WhatsAppUsageHistoryEntry>();

  for (const row of rows) {
    const credits = Number(row.credits_charged ?? 0);
    if (!Number.isFinite(credits) || credits <= 0) continue;

    const when = row.sent_at ?? row.created_at;
    const date = when.slice(0, 10);
    const useCase = labelForUsageRow(row.trigger_source, row.meta_category);
    const key = `${date}::${useCase}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.recipient_count += 1;
      existing.credits_spent += credits;
    } else {
      buckets.set(key, { date, use_case: useCase, recipient_count: 1, credits_spent: credits });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export function buildBillingView(args: {
  plan: string;
  usage: BillingUsage;
  whatsappBalance: number;
  whatsappPurchased: number;
  whatsappCreditPriceInr: number;
  whatsappUsageHistory: WhatsAppUsageHistoryEntry[];
}): BillingSettingsView {
  const plan = normalizePlanTier(args.plan);
  const limits = limitForTier(plan);
  const purchased = Math.max(args.whatsappPurchased, 1);
  const usedFraction = 1 - args.whatsappBalance / purchased;
  return {
    plan,
    usage: args.usage,
    limits,
    whatsapp: {
      balance: args.whatsappBalance,
      purchased,
      credit_price_inr: args.whatsappCreditPriceInr,
      usage_history: args.whatsappUsageHistory,
      low_balance: args.whatsappBalance <= 0 || usedFraction >= LOW_BALANCE_USAGE_THRESHOLD,
    },
    warnings: buildWarnings(args.usage, limits),
  };
}
