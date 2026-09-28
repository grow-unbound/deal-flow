import { describe, expect, it } from 'vitest';
import { isDesktopRequest, pickDefaultBuyerRouteId } from '@/lib/inbox/inbox-default-buyer';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

function entry(overrides: Partial<InboxEntry>): InboxEntry {
  return {
    id: 'e', buyer_id: 'b', buyer_name: 'B', entry_type: 'new_enquiry', status: 'new',
    priority_at: '2026-09-07T10:00:00Z', time_bucket: 'today', metadata: {},
    ...overrides,
  } as InboxEntry;
}

describe('isDesktopRequest', () => {
  it('trusts the viewport cookie over the user agent', () => {
    expect(isDesktopRequest('mobile', 'Mozilla/5.0 (Macintosh)')).toBe(false);
    expect(isDesktopRequest('desktop', 'Mozilla/5.0 (iPhone) Mobile')).toBe(true);
  });

  it('falls back to the user agent on the first visit', () => {
    expect(isDesktopRequest(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(true);
    expect(isDesktopRequest(undefined, 'Mozilla/5.0 (iPhone; CPU iPhone OS) Mobile/15E148')).toBe(false);
    expect(isDesktopRequest(undefined, null)).toBe(true);
  });
});

describe('pickDefaultBuyerRouteId', () => {
  const entries = [
    entry({ id: 'e1', buyer_id: 'b1', priority_at: '2026-09-07T12:00:00Z' }),
    entry({ id: 'e2', buyer_id: 'b2', priority_at: '2026-09-07T10:00:00Z' }),
  ];

  it('returns null for an empty inbox', () => {
    expect(pickDefaultBuyerRouteId([], undefined)).toBeNull();
  });

  it('opens the top row when nothing was opened before', () => {
    expect(pickDefaultBuyerRouteId(entries, undefined)).toBe('b1');
  });

  it('restores the last opened buyer while it is still listed', () => {
    expect(pickDefaultBuyerRouteId(entries, 'b2')).toBe('b2');
  });

  it('ignores a last opened buyer that is no longer listed', () => {
    expect(pickDefaultBuyerRouteId(entries, 'gone')).toBe('b1');
  });

  it('falls back to the entry id for buyer-less entries', () => {
    expect(pickDefaultBuyerRouteId([entry({ id: 'solo', buyer_id: null })], undefined)).toBe('solo');
  });
});
