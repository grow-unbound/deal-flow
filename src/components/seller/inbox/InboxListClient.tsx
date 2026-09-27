'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Bot, Mail, MessageCircle, Phone, Smartphone, UserRound, Workflow } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/empty-state';
import { CountChip } from '@/components/ui/badge';
import { SellerMobileList, SellerMobileListSkeleton, type SellerMobileListItem } from '@/components/seller/mobile/SellerMobileList';
import { useEnquiryTriageByIds, useInboxEntries } from '@/hooks/useInboxEntries';
import { groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { TIME_BUCKET_LABEL, type InboxEntryType, type InboxGroupedBuyer } from '@/lib/inbox/inbox-types';
import { buildListSupportingLine } from '@/lib/inbox/inbox-entry-copy';
import { buildEnquiryPreviewLine, enquiryHasAtRiskLine } from '@/lib/inbox/inbox-list-entry-copy';
import type { EnquiryTriagePayload } from '@/lib/inbox/enquiry-triage';
import { sourceChannelForEntries, type InboxChannel } from '@/lib/inbox/inbox-detail-groups';
import { InboxEmptyState } from './InboxEmptyState';

const LAST_OPENED_STORAGE_KEY = 'inbox-last-opened-buyer';

const FILTER_CHIPS: Array<{ label: string; types: InboxEntryType[] }> = [
  { label: 'Approvals', types: ['business_approval', 'new_user_login'] },
  { label: 'Enquiries', types: ['new_enquiry'] },
  { label: 'Orders', types: ['new_order_confirmation', 'order_dispatch_needed'] },
  { label: 'Collections', types: ['invoice_due', 'invoice_overdue', 'credit_limit_breach'] },
];

const CHANNEL_ICON: Record<InboxChannel, typeof Smartphone> = {
  storefront: Smartphone,
  backend: Workflow,
  manual: UserRound,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
  unknown: Bot,
};

function ChannelBadge({ channel }: { channel: InboxChannel }) {
  const Icon = CHANNEL_ICON[channel] ?? Bot;
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-cream-300 bg-white text-cream-700" title={channel}>
      <Icon className="h-4 w-4" strokeWidth={1.85} aria-hidden />
    </span>
  );
}

function buyerListItem(
  buyer: InboxGroupedBuyer,
  activeId: string | undefined,
  enquiryByEntryId: Map<string, EnquiryTriagePayload>,
): SellerMobileListItem {
  // entries is ordered pinned-first, then newest -- entries[0] is what the row's
  // summary should describe, same "primary entry" convention buildListSupportingLine
  // already uses.
  const primary = buyer.entries[0];
  const enquiry = primary?.entry_type === 'new_enquiry' ? enquiryByEntryId.get(primary.id) : undefined;
  const atRisk = enquiry ? enquiryHasAtRiskLine(enquiry.lines) : false;

  return {
    id: buyer.buyerKey,
    href: `/today/${buyer.buyerId ?? buyer.buyerKey}`,
    leading: <ChannelBadge channel={sourceChannelForEntries(buyer.entries)} />,
    eyebrow: enquiry ? enquiry.estimateNumber : undefined,
    primary: buyer.buyerName,
    supporting: enquiry ? buildEnquiryPreviewLine(enquiry.lines, enquiry.totalAmount) : buildListSupportingLine(buyer.entries),
    trailing: buyer.totalCount > 1 ? <CountChip>{buyer.totalCount}</CountChip> : undefined,
    status: atRisk ? { label: 'At risk', tone: 'danger' } : undefined,
    badge: buyer.entries.some((entry) => entry.status === 'new') ? 'new' : undefined,
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
  const [isDesktop, setIsDesktop] = useState(false);

  const chipTypes = activeChip ? FILTER_CHIPS.find((c) => c.label === activeChip)?.types : undefined;
  const { data, isLoading, isError, refetch } = useInboxEntries(tab, chipTypes);

  const unfiltered = useInboxEntries(tab);
  const allEntries = unfiltered.data?.entries ?? [];
  const totalCount = allEntries.length;
  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const chip of FILTER_CHIPS) {
      counts[chip.label] = allEntries.filter((e) => chip.types.includes(e.entry_type)).length;
    }
    return counts;
  }, [allEntries]);

  const sections = useMemo(
    () => groupEntriesByDateAndCustomer(data?.entries ?? []),
    [data?.entries],
  );

  const primaryEnquiryEntryIds = useMemo(
    () => sections
      .flatMap((section) => section.buyers)
      .map((buyer) => buyer.entries[0])
      .filter((entry): entry is NonNullable<typeof entry> => entry?.entry_type === 'new_enquiry')
      .map((entry) => entry.id),
    [sections],
  );
  const enquiryByEntryId = useEnquiryTriageByIds(primaryEnquiryEntryIds);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    setIsDesktop(query.matches);
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Today has no "closed" state — a customer is always open. On landing at bare
  // /today (no detail param), jump straight to the last customer this device had
  // open on desktop, or the first row in the list if there's no remembered one.
  // Mobile stays on the list so the user can choose the entry item first.
  useEffect(() => {
    if (params.id != null) return;
    if (!isDesktop) return;
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
  }, [params.id, isDesktop, isLoading, sections, router]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-5 pt-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-cream-500">Today</p>
        <h1 className="mt-1 pb-4 text-xl font-bold tracking-[-0.02em] text-cream-950">
          {tab === 'active' ? `${totalCount} need${totalCount === 1 ? 's' : ''} your attention` : 'Resolved'}
        </h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'resolved')}>
          <TabsList className="flex w-full gap-0">
            <TabsTrigger value="active" className="flex-1">Needs attention</TabsTrigger>
            <TabsTrigger value="resolved" className="flex-1">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 py-4">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setActiveChip((prev) => (prev === chip.label ? null : chip.label))}
              className={[
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                activeChip === chip.label
                  ? 'border-ember-300 bg-ember-50 text-ember-700'
                  : 'border-cream-300 text-cream-700 hover:bg-cream-100',
              ].join(' ')}
            >
              {chip.label}
              {chipCounts[chip.label] ? <span className="ml-1.5 font-mono tabular-nums text-cream-500">{chipCounts[chip.label]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
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
            <div key={bucket} className="pt-6">
              <p className="px-3.5 pb-2 text-xs font-medium uppercase tracking-[0.08em] text-cream-500">
                {TIME_BUCKET_LABEL[bucket]}
              </p>
              <SellerMobileList
                forceVisible
                density="roomy"
                items={buyers.map((buyer) => buyerListItem(buyer, params.id, enquiryByEntryId))}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
