import { describe, expect, it } from 'vitest';

import { campaignAudienceLabel, campaignScopeToBroadcastTarget, resolveCampaignLandingAudience } from '@/lib/server/campaign-broadcast';

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

describe('resolveCampaignLandingAudience', () => {
  it('returns cohort name and cached member count', () => {
    expect(
      resolveCampaignLandingAudience({
        scopeType: 'cohort',
        scopeValue: { cohort_id: 'cohort-1' },
        cohort: { name: 'Premium Retailers', cached_member_count: 42 },
        allBuyersCount: 100,
      }),
    ).toEqual({ label: 'Premium Retailers', buyerCount: 42 });
  });

  it('returns Selected buyers label with buyer id count', () => {
    expect(
      resolveCampaignLandingAudience({
        scopeType: 'buyer',
        scopeValue: { buyer_ids: ['b1', 'b2', 'b3'] },
        cohort: null,
        allBuyersCount: 100,
      }),
    ).toEqual({ label: 'Selected buyers', buyerCount: 3 });
  });

  it('returns All buyers with tenant count', () => {
    expect(
      resolveCampaignLandingAudience({
        scopeType: 'all',
        scopeValue: {},
        cohort: null,
        allBuyersCount: 87,
      }),
    ).toEqual({ label: 'All buyers', buyerCount: 87 });
  });

  it('returns null buyer count for geography scope', () => {
    expect(
      resolveCampaignLandingAudience({
        scopeType: 'geography',
        scopeValue: { city: 'Mumbai' },
        cohort: null,
        allBuyersCount: 87,
      }),
    ).toEqual({ label: 'Geography filter', buyerCount: null });
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
