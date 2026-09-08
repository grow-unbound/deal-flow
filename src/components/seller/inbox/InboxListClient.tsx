'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInboxEntries } from '@/hooks/useInboxEntries';
import { groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { TIME_BUCKET_LABEL, type InboxEntryType } from '@/lib/inbox/inbox-types';
import { InboxEntryRow } from './InboxEntryRow';
import { InboxEmptyState } from './InboxEmptyState';
import { ErrorState } from '@/components/ui/empty-state';

function InboxListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[12px] bg-cream-100" />
      ))}
    </div>
  );
}

const FILTER_CHIPS: Array<{ label: string; types: InboxEntryType[] }> = [
  { label: 'Approvals', types: ['business_approval', 'new_user_login'] },
  { label: 'Enquiries', types: ['new_enquiry'] },
  { label: 'Orders', types: ['new_order_confirmation', 'order_dispatch_needed'] },
  { label: 'Collections', types: ['invoice_due', 'invoice_overdue', 'credit_limit_breach'] },
];

export function InboxListClient() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const chipTypes = activeChip ? FILTER_CHIPS.find((c) => c.label === activeChip)?.types : undefined;
  const { data, isLoading, isError, refetch } = useInboxEntries(tab, chipTypes);

  const sections = useMemo(
    () => groupEntriesByDateAndCustomer(data?.entries ?? []),
    [data?.entries],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-cream-200 px-4 pt-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'resolved')}>
          <TabsList>
            <TabsTrigger value="active">Needs attention</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 py-3">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setActiveChip((prev) => (prev === chip.label ? null : chip.label))}
              className={[
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                activeChip === chip.label
                  ? 'border-ember-300 bg-ember-50 text-ember-700'
                  : 'border-cream-300 text-cream-700 hover:bg-cream-100',
              ].join(' ')}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <InboxListSkeleton />
        ) : isError ? (
          <ErrorState
            heading="Couldn't load Inbox"
            description="There was a problem fetching your Inbox entries."
            onRetry={() => refetch()}
          />
        ) : sections.length === 0 ? (
          <InboxEmptyState tab={tab} />
        ) : (
          sections.map(({ bucket, buyers }) => (
            <div key={bucket} className="px-2 pt-5">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-500">
                {TIME_BUCKET_LABEL[bucket]}
              </p>
              <div className="space-y-1">
                {buyers.map((buyer) => (
                  <InboxEntryRow
                    key={buyer.buyerKey}
                    buyer={buyer}
                    isActive={params.id === buyer.buyerId}
                    onSelect={() => router.push(`/today/${buyer.buyerId ?? buyer.buyerKey}`)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
