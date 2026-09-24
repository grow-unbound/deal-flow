'use client';

import { useMemo } from 'react';
import { useMobileHeaderTitle } from '@/components/layout/MobileHeaderTitle';
import { useEntryHistory, useInboxEntries } from '@/hooks/useInboxEntries';
import { buildCollectionGroup, isCollectionEntry } from '@/lib/inbox/inbox-detail-groups';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import { DuesActions, DuesSections, DUES_TITLE, duesSubtitle } from './InboxCollectionGroupCard';
import { InboxDetailSkeleton } from './InboxDetailClient';
import { InboxEntryFrame } from './InboxEntryFrame';

/** Mobile full-screen dues screen (`/today/[buyerId]/dues`): invoices in the body, actions pinned in the footer. */
export function InboxDuesDetailPage({ buyerId }: { buyerId: string }) {
  const { data, isLoading } = useInboxEntries('active');
  const { overrides, localEvents } = useLocalEntryActions();
  const history = useEntryHistory(buyerId);

  const group = useMemo(() => {
    const entries = (data?.entries ?? [])
      .filter((e) => (e.buyer_id ? e.buyer_id === buyerId : e.id === buyerId) && isCollectionEntry(e))
      .map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e));
    return buildCollectionGroup(entries);
  }, [data, buyerId, overrides]);

  useMobileHeaderTitle(group ? 'Dues' : null);

  if (isLoading) return <InboxDetailSkeleton />;
  if (!group) {
    return <div className="p-6 text-sm text-cream-500">No dues in your active list.</div>;
  }

  return (
    <InboxEntryFrame
      variant="stacked"
      footer={<DuesActions group={group} buyerId={buyerId} historyEvents={history.data?.events} localEvents={localEvents} />}
    >
      <div>
        <h2 className="text-base font-semibold tracking-[-0.015em] text-cream-900">{DUES_TITLE}</h2>
        <p className="mt-1 text-sm text-cream-600">{duesSubtitle(group)}</p>
      </div>
      <DuesSections group={group} />
    </InboxEntryFrame>
  );
}
