import { describe, expect, it } from 'vitest';

import { campaignAudienceLabel, campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';

describe('campaignScopeToBroadcastTarget', () => {
  it('maps cohort scope to cohort targeting', () => {
    expect(
      campaignScopeToBroadcastTarget({
        scopeType: 'cohort',
        scopeValue: { cohort_id: 'cohort-1' },
      }),
    ).toEqual({
      targetType: 'cohort',
      targetCohortId: 'cohort-1',
    });
  });

  it('maps buyer scope to buyer selection', () => {
    expect(
      campaignScopeToBroadcastTarget({
        scopeType: 'buyer',
        scopeValue: { buyer_ids: ['buyer-1', 'buyer-2'] },
      }),
    ).toEqual({
      targetType: 'buyer_selection',
      targetBuyerIds: ['buyer-1', 'buyer-2'],
    });
  });

  it('maps all scope to all buyers', () => {
    expect(
      campaignScopeToBroadcastTarget({
        scopeType: 'all',
        scopeValue: {},
      }),
    ).toEqual({
      targetType: 'all_buyers',
    });
  });
});

describe('campaignAudienceLabel', () => {
  it('formats cohort audience with member count', () => {
    expect(
      campaignAudienceLabel({
        scopeType: 'cohort',
        scopeValue: { cohort_id: 'cohort-1' },
        cohortName: 'Premium Retailers',
        memberCount: 42,
      }),
    ).toBe('Premium Retailers (42 buyers)');
  });
});
