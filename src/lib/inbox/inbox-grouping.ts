import { TIME_BUCKET_ORDER, type InboxEntry, type InboxGroupedBuyer, type InboxTimeBucket } from './inbox-types';

export function isPinnedEntry(entry: InboxEntry): boolean {
  if (entry.entry_type === 'credit_limit_breach') return true;
  if (entry.entry_type === 'invoice_overdue') {
    const tier = entry.metadata?.aging_tier;
    return tier === '16-30d' || tier === '30d+';
  }
  return false;
}

export function sortEntriesForStack(entries: InboxEntry[]): InboxEntry[] {
  return [...entries].sort((a, b) => {
    const pinnedA = isPinnedEntry(a);
    const pinnedB = isPinnedEntry(b);
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
    return new Date(b.priority_at).getTime() - new Date(a.priority_at).getTime();
  });
}

const BUCKET_RANK: Record<InboxTimeBucket, number> = Object.fromEntries(
  TIME_BUCKET_ORDER.map((bucket, index) => [bucket, index]),
) as Record<InboxTimeBucket, number>;

/** Earlier in TIME_BUCKET_ORDER = more recent/urgent. */
function freshestBucket(a: InboxTimeBucket, b: InboxTimeBucket): InboxTimeBucket {
  return BUCKET_RANK[a] <= BUCKET_RANK[b] ? a : b;
}

export function groupEntriesByDateAndCustomer(
  entries: InboxEntry[],
): Array<{ bucket: InboxTimeBucket; buyers: InboxGroupedBuyer[] }> {
  const byBuyerKey = new Map<string, InboxEntry[]>();
  for (const entry of entries) {
    const key = entry.buyer_id ?? entry.id;
    const list = byBuyerKey.get(key) ?? [];
    list.push(entry);
    byBuyerKey.set(key, list);
  }

  const buyerGroups: InboxGroupedBuyer[] = [];
  for (const [buyerKey, buyerEntries] of byBuyerKey) {
    const bucket = buyerEntries.reduce<InboxTimeBucket>(
      (acc, e) => freshestBucket(acc, e.time_bucket),
      buyerEntries[0].time_bucket,
    );
    buyerGroups.push({
      buyerKey,
      buyerId: buyerEntries[0].buyer_id,
      buyerName: buyerEntries[0].buyer_name,
      timeBucket: bucket,
      entries: sortEntriesForStack(buyerEntries),
      totalCount: buyerEntries[0].customer_entry_count,
    });
  }

  const byBucket = new Map<InboxTimeBucket, InboxGroupedBuyer[]>();
  for (const group of buyerGroups) {
    const list = byBucket.get(group.timeBucket) ?? [];
    list.push(group);
    byBucket.set(group.timeBucket, list);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => {
      const aLatest = Math.max(...a.entries.map((e) => new Date(e.priority_at).getTime()));
      const bLatest = Math.max(...b.entries.map((e) => new Date(e.priority_at).getTime()));
      return bLatest - aLatest;
    });
  }

  return TIME_BUCKET_ORDER
    .filter((bucket) => byBucket.has(bucket))
    .map((bucket) => ({ bucket, buyers: byBucket.get(bucket)! }));
}
