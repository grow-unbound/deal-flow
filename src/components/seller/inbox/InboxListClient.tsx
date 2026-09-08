'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/seller/layout/PageHeader';
import { EntityAvatar } from '@/components/seller/layout/EntityAvatar';
import { SellerMobileList, SellerMobileListSkeleton, type SellerMobileListItem } from '@/components/seller/mobile/SellerMobileList';
import { useInboxEntries } from '@/hooks/useInboxEntries';
import { groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { TIME_BUCKET_LABEL, type InboxEntryType, type InboxGroupedBuyer } from '@/lib/inbox/inbox-types';
import { buildEntrySubtitleParts, getInitials } from '@/lib/inbox/inbox-entry-copy';
import { InboxEmptyState } from './InboxEmptyState';

const LAST_OPENED_STORAGE_KEY = 'inbox-last-opened-buyer';

const FILTER_CHIPS: Array<{ label: string; types: InboxEntryType[] }> = [
  { label: 'Approvals', types: ['business_approval', 'new_user_login'] },
  { label: 'Enquiries', types: ['new_enquiry'] },
  { label: 'Orders', types: ['new_order_confirmation', 'order_dispatch_needed'] },
  { label: 'Collections', types: ['invoice_due', 'invoice_overdue', 'credit_limit_breach'] },
];

function buyerListItem(buyer: InboxGroupedBuyer, activeId: string | undefined): SellerMobileListItem {
  const primaryEntry = buyer.entries[0];
  return {
    id: buyer.buyerKey,
    href: `/today/${buyer.buyerId ?? buyer.buyerKey}`,
    leading: <EntityAvatar initials={getInitials(buyer.buyerName)} hue="cream" size={32} />,
    primary: buyer.buyerName,
    supporting: buildEntrySubtitleParts(primaryEntry).join(' · '),
    trailing: buyer.totalCount > 1 ? String(buyer.totalCount) : undefined,
    selected: activeId === buyer.buyerId || activeId === buyer.buyerKey,
    onClick: () => {
      try {
        window.localStorage.setItem(LAST_OPENED_STORAGE_KEY, buyer.buyerKey);
      } catch {
        // Storage unavailable — the redirect-on-load below just falls back to the first row.
      }
    },
  };
}

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

  // Today has no "closed" state — a customer is always open. On landing at bare
  // /today (no detail param), jump straight to the last customer this device had
  // open, or the first row in the list if there's no remembered one.
  useEffect(() => {
    if (params.id != null) return;
    if (isLoading || sections.length === 0) return;

    const allBuyers = sections.flatMap((section) => section.buyers);
    if (allBuyers.length === 0) return;

    let target = allBuyers[0];
    try {
      const lastKey = window.localStorage.getItem(LAST_OPENED_STORAGE_KEY);
      const match = lastKey ? allBuyers.find((b) => b.buyerKey === lastKey) : undefined;
      if (match) target = match;
    } catch {
      // Storage unavailable — fall back to the first row.
    }

    router.replace(`/today/${target.buyerId ?? target.buyerKey}`);
  }, [params.id, isLoading, sections, router]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-cream-200 px-4 pt-4">
        <PageHeader
          eyebrow="Inbox"
          title="Today"
          subtitle="What needs action now across orders, collections, buyer requests, and follow-ups."
          horizon=""
          showHorizonControl={false}
          compact
        />
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
          <div className="pt-4">
            <SellerMobileListSkeleton forceVisible showLeading />
          </div>
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
              <SellerMobileList
                forceVisible
                items={buyers.map((buyer) => buyerListItem(buyer, params.id))}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
