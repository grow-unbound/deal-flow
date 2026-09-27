'use client';

import { useMemo } from 'react';
import { useMobileHeaderTitle } from '@/components/layout/MobileHeaderTitle';
import { useEntryHistory, useInboxEntries } from '@/hooks/useInboxEntries';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import { ENTRY_TYPE_LABEL } from '@/lib/inbox/inbox-entry-copy';
import { InboxActionBar } from './InboxActionBar';
import { InboxApprovalActionBar } from './InboxApprovalActionBar';
import { InboxEntryDetailContent, isApprovalEntry } from './InboxEntryDetailContent';
import { InboxEntryFrame } from './InboxEntryFrame';
import { InboxDetailSkeleton } from './InboxDetailClient';

/**
 * Mobile full-screen route for a single entry (`/today/[buyerId]/[entryId]`).
 * Desktop shows the same content inline via InboxEntryCard -- this is
 * mobile's stacked-navigation counterpart, sharing InboxEntryDetailContent
 * and InboxEntryFrame so the body/footer never diverge from desktop's.
 */
export function InboxEntryDetailPage({ buyerId, entryId }: { buyerId: string; entryId: string }) {
  const { data, isLoading } = useInboxEntries('active');
  const { overrides, localEvents, applyLocalAction } = useLocalEntryActions();
  const history = useEntryHistory(buyerId);

  const entry = useMemo(() => {
    const found = (data?.entries ?? []).find((e) => e.id === entryId);
    if (!found) return null;
    return overrides[found.id] ? { ...found, ...overrides[found.id] } : found;
  }, [data, entryId, overrides]);

  const estimateNumberForTitle = entry && typeof entry.metadata.estimate_number === 'string' ? entry.metadata.estimate_number : null;
  const headerTitle = entry
    ? `${ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}${entry.entry_type === 'new_enquiry' && estimateNumberForTitle ? ` · ${estimateNumberForTitle}` : ''}`
    : null;
  useMobileHeaderTitle(headerTitle);

  if (isLoading) return <InboxDetailSkeleton />;

  if (!entry) {
    return (
      <div className="p-6 text-sm text-cream-500">This item is no longer in your active list.</div>
    );
  }

  const tenantId = entry.tenant_id;

  return (
    <InboxEntryFrame
      variant="stacked"
      footer={isApprovalEntry(entry) ? (
        <InboxApprovalActionBar
          entry={entry}
          tenantId={tenantId}
          historyEvents={history.data?.events}
          localEvents={localEvents}
          applyLocalAction={applyLocalAction}
        />
      ) : (
        <InboxActionBar
          entry={entry}
          tenantId={tenantId}
          historyEvents={history.data?.events}
          localEvents={localEvents}
          applyLocalAction={applyLocalAction}
        />
      )}
    >
      <InboxEntryDetailContent entry={entry} />
    </InboxEntryFrame>
  );
}
