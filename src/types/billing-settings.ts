import { z } from 'zod';

import type { PlanTier } from '@/constants/tier-limits';

export const PlanTierSchema = z.enum(['starter', 'growth', 'scale']);

export const UpgradeRequestSchema = z.object({
  target_tier: PlanTierSchema,
  contact_name: z.string().min(1, 'Name is required').max(200),
  contact_phone: z.string().min(5, 'Phone is required').max(40),
  note: z.string().max(2000).optional(),
});

export type UpgradeRequestInput = z.infer<typeof UpgradeRequestSchema>;

export interface BillingUsage {
  cohorts: number;
  price_lists: number;
  catalogs: number;
}

export interface BillingLimits {
  cohorts: number;
  price_lists: number;
  catalogs: number;
}

export interface BillingWarning {
  key: keyof BillingUsage;
  used: number;
  limit: number;
  message: string;
}

export interface WhatsAppUsageHistoryEntry {
  /** Bucketed date (YYYY-MM-DD) this row summarizes. */
  date: string;
  /** trigger_source or meta_category grouping (broadcast-level granularity lands in Phase E). */
  use_case: string;
  recipient_count: number;
  credits_spent: number;
}

export interface BillingSettingsView {
  plan: PlanTier;
  usage: BillingUsage;
  limits: BillingLimits;
  whatsapp: {
    balance: number;
    purchased: number;
    credit_price_inr: number;
    usage_history: WhatsAppUsageHistoryEntry[];
    low_balance: boolean;
  };
  warnings: BillingWarning[];
}
