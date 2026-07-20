import { describe, expect, it } from 'vitest';

import {
  buildCampaignNotifyRecipientSegments,
  selectCampaignNotifyRecipientBuyerIds,
} from '@/lib/server/campaign-publish-notify';

describe('campaign publish notify recipient segments', () => {
  it('partitions eligible buyers into not-viewed and viewed-not-ordered segments', () => {
    const segments = buildCampaignNotifyRecipientSegments({
      eligibleBuyerIds: ['buyer-1', 'buyer-2', 'buyer-3', 'buyer-4'],
      viewedBuyerIds: ['buyer-1', 'buyer-3'],
      convertingBuyerIds: ['buyer-3'],
    });

    expect(segments.allEligibleBuyerIds).toEqual(['buyer-1', 'buyer-2', 'buyer-3', 'buyer-4']);
    expect(segments.notViewedBuyerIds).toEqual(['buyer-2', 'buyer-4']);
    expect(segments.viewedNotOrderedBuyerIds).toEqual(['buyer-1']);
  });

  it('returns the correct buyer ids for each recipient filter', () => {
    const segments = buildCampaignNotifyRecipientSegments({
      eligibleBuyerIds: ['buyer-1', 'buyer-2', 'buyer-3'],
      viewedBuyerIds: ['buyer-1', 'buyer-2'],
      convertingBuyerIds: ['buyer-2'],
    });

    expect(selectCampaignNotifyRecipientBuyerIds(segments, 'all_eligible')).toEqual(['buyer-1', 'buyer-2', 'buyer-3']);
    expect(selectCampaignNotifyRecipientBuyerIds(segments, 'not_viewed')).toEqual(['buyer-3']);
    expect(selectCampaignNotifyRecipientBuyerIds(segments, 'viewed_not_ordered')).toEqual(['buyer-1']);
  });
});
