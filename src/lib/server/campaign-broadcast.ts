/**
 * Map app.campaigns scope → WhatsApp broadcast targeting fields.
 */

import type { WhatsAppBroadcastTargetType } from '@/lib/zod';

export type CampaignScopeType = 'cohort' | 'buyer' | 'geography' | 'all';

export interface CampaignBroadcastTarget {
  targetType: WhatsAppBroadcastTargetType;
  targetCohortId?: string | null;
  targetBuyerIds?: string[] | null;
  targetFilter?: Record<string, string | number> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function campaignScopeToBroadcastTarget(input: {
  scopeType: CampaignScopeType;
  scopeValue: Record<string, unknown> | null;
}): CampaignBroadcastTarget {
  const scopeValue = asRecord(input.scopeValue);

  switch (input.scopeType) {
    case 'cohort': {
      const cohortId = typeof scopeValue.cohort_id === 'string' ? scopeValue.cohort_id : null;
      return { targetType: 'cohort', targetCohortId: cohortId };
    }
    case 'buyer': {
      const buyerIds = Array.isArray(scopeValue.buyer_ids)
        ? scopeValue.buyer_ids.filter((id): id is string => typeof id === 'string')
        : [];
      return { targetType: 'buyer_selection', targetBuyerIds: buyerIds };
    }
    case 'geography': {
      const filter: Record<string, string | number> = {};
      for (const key of ['city', 'state', 'pincode', 'zone'] as const) {
        const value = scopeValue[key];
        if (typeof value === 'string' && value.trim()) filter[key] = value.trim();
        if (typeof value === 'number') filter[key] = value;
      }
      return { targetType: 'geography_filter', targetFilter: filter };
    }
    case 'all':
    default:
      return { targetType: 'all_buyers' };
  }
}

export function campaignAudienceLabel(input: {
  scopeType: CampaignScopeType;
  scopeValue: Record<string, unknown> | null;
  cohortName?: string | null;
  memberCount?: number | null;
}): string {
  const countSuffix = input.memberCount != null ? ` (${input.memberCount} buyers)` : '';

  switch (input.scopeType) {
    case 'cohort':
      return `${input.cohortName ?? 'Customer group'}${countSuffix}`;
    case 'buyer': {
      const buyerIds = asRecord(input.scopeValue).buyer_ids;
      const n = Array.isArray(buyerIds) ? buyerIds.length : 0;
      return `${n} selected buyer${n === 1 ? '' : 's'}`;
    }
    case 'geography':
      return `Geography filter${countSuffix}`;
    case 'all':
      return `All buyers${countSuffix}`;
    default:
      return 'Campaign audience';
  }
}
