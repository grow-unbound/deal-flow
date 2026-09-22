'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, ChevronLeft, ChevronRight, ExternalLink, Mail, MessageCircle, Phone, ShoppingBag, UserRound, Workflow } from 'lucide-react';
import { DetailActions, DetailHeader } from '@/components/seller/detail';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { useEntryHistory, useInboxEntries } from '@/hooks/useInboxEntries';
import { sortEntriesForStack, groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import { ENTRY_TYPE_LABEL } from '@/lib/inbox/inbox-entry-copy';
import { buildCollectionGroup, isCollectionEntry, sourceChannelForEntries, type InboxChannel } from '@/lib/inbox/inbox-detail-groups';
import { InboxEntryCard } from './InboxEntryCard';
import { InboxActionBar } from './InboxActionBar';
import { InboxApprovalActionBar } from './InboxApprovalActionBar';
import { InboxApprovalDocuments } from './InboxApprovalDocuments';
import { InboxEnquiryPanel } from './InboxEnquiryPanel';
import { InboxHistorySheet } from './InboxHistorySheet';
import { InboxCollectionGroupCard } from './InboxCollectionGroupCard';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const CHANNEL_ICON: Record<InboxChannel, typeof ShoppingBag> = {
  storefront: ShoppingBag,
  backend: Workflow,
  manual: UserRound,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
  unknown: Bot,
};

function channelIcon(entries: InboxEntry[]) {
  const Icon = CHANNEL_ICON[sourceChannelForEntries(entries)] ?? Bot;
  return <Icon className="h-5 w-5" aria-hidden />;
}

function InboxDetailSkeleton() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col" role="status" aria-label="Loading">
      <div className="shrink-0 px-4 py-4 md:px-6 md:py-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[14px] bg-cream-200" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-5 w-48 animate-pulse rounded-full bg-cream-200" />
            <div className="h-3.5 w-32 animate-pulse rounded-full bg-cream-200" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 md:px-8">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-[14px] border border-cream-300 bg-white px-6 py-5">
            <div className="h-4 w-40 animate-pulse rounded-full bg-cream-200" />
            <div className="mt-2 h-3.5 w-24 animate-pulse rounded-full bg-cream-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InboxDetailClient({ buyerId }: { buyerId: string }) {
  const router = useRouter();
  const { data, isLoading } = useInboxEntries('active');
  const { overrides, localEvents, applyLocalAction } = useLocalEntryActions();
  const history = useEntryHistory(buyerId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    setIsDesktop(query.matches);
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const allEntries = data?.entries ?? [];
  const buyerEntries = useMemo(
    () =>
      sortEntriesForStack(
        allEntries
          // buyer-less entries (e.g. a signup before any buyer row exists) group under
          // their own entry id -- see groupEntriesByDateAndCustomer's `buyer_id ?? id`
          // fallback, which is also what the list row links to.
          .filter((e) => (e.buyer_id ? e.buyer_id === buyerId : e.id === buyerId))
          .map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e)),
      ),
    [allEntries, buyerId, overrides],
  );

  const orderedBuyerKeys = useMemo(
    () => groupEntriesByDateAndCustomer(allEntries).flatMap((section) => section.buyers.map((b) => b.buyerKey)),
    [allEntries],
  );
  const currentIndex = orderedBuyerKeys.indexOf(buyerId);
  const prevBuyerKey = currentIndex > 0 ? orderedBuyerKeys[currentIndex - 1] : null;
  const nextBuyerKey = currentIndex >= 0 && currentIndex < orderedBuyerKeys.length - 1 ? orderedBuyerKeys[currentIndex + 1] : null;

  if (isLoading) {
    return <InboxDetailSkeleton />;
  }

  if (buyerEntries.length === 0) {
    return <div className="p-6 text-sm text-cream-500">This item is no longer in your active list.</div>;
  }

  const buyerName = buyerEntries[0].buyer_name;
  const buyerPhone = buyerEntries[0].buyer_phone;
  const linkedBuyerId = buyerEntries[0].buyer_id;
  const tenantId = buyerEntries[0].tenant_id;
  const collectionGroup = buildCollectionGroup(buyerEntries);
  const nonCollectionEntries = buyerEntries.filter((entry) => !isCollectionEntry(entry));
  const visibleGroupCount = (collectionGroup ? 1 : 0) + nonCollectionEntries.length;
  const onlyGroupId = visibleGroupCount === 1 ? (collectionGroup?.id ?? nonCollectionEntries[0]?.id ?? null) : null;
  const openCount = buyerEntries.length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col">
      <div className="shrink-0 px-4 py-4 md:px-6 md:py-4">
        {/* Today has no "closed" state — a customer is always open, so the pane's
            close (X) affordance (rendered automatically by DetailHeader whenever
            SplitPaneCloseContext is present) is suppressed here on purpose. */}
        <SplitPaneCloseContext.Provider value={null}>
          <DetailHeader
            avatar={{ kind: 'channel', icon: channelIcon(buyerEntries) }}
            title={
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate">{buyerName}</span>
                {linkedBuyerId ? (
                  <Link
                    href={`/customers/${linkedBuyerId}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open buyer in new tab"
                    title="Open buyer in new tab"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cream-500 transition-colors hover:bg-cream-100 hover:text-cream-900"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null}
              </span>
            }
            status={{
              label: `${openCount} open issue${openCount === 1 ? '' : 's'}`,
              tone: openCount > 0 ? 'warning' : 'success',
            }}
            // 'Show history' CTA hidden for now -- the sheet only lists a bare action
            // label per event, no per-action detail, so it wasn't earning its place in
            // the header. Re-add once InboxHistorySheet shows more than the label.
            subtitle={[buyerPhone ?? 'No phone on file']}
            actions={
              <DetailActions
                inline={
                  <>
                    <div className="flex items-center overflow-hidden rounded-full border border-cream-300">
                      <button
                        type="button"
                        disabled={!prevBuyerKey}
                        onClick={() => prevBuyerKey && router.push(`/today/${prevBuyerKey}`)}
                        className="p-2 text-cream-600 hover:bg-cream-100 disabled:opacity-30"
                        aria-label="Previous customer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={!nextBuyerKey}
                        onClick={() => nextBuyerKey && router.push(`/today/${nextBuyerKey}`)}
                        className="p-2 text-cream-600 hover:bg-cream-100 disabled:opacity-30"
                        aria-label="Next customer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                }
              />
            }
          />
        </SplitPaneCloseContext.Provider>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-8">
        {isDesktop ? (
          <div className="space-y-5">
            {collectionGroup ? (
              <InboxCollectionGroupCard
                group={collectionGroup}
                buyerId={buyerId}
                expanded={visibleGroupCount === 1 || expandedId === collectionGroup.id}
                historyEvents={history.data?.events}
                localEvents={localEvents}
                onToggle={() => setExpandedId((prev) => (prev === collectionGroup.id ? null : collectionGroup.id))}
              />
            ) : null}
            {nonCollectionEntries.map((entry) => (
              <InboxEntryCard
                key={entry.id}
                entry={entry}
                expanded={visibleGroupCount === 1 || expandedId === entry.id}
                onToggle={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                tenantId={tenantId}
                historyEvents={history.data?.events}
                localEvents={localEvents}
                applyLocalAction={applyLocalAction}
              />
            ))}
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={expandedId ?? onlyGroupId ?? undefined}
            onValueChange={(value) => setExpandedId(value || null)}
          >
            {collectionGroup ? (
              <AccordionItem value={collectionGroup.id}>
                <AccordionTrigger aria-label="Dues">Dues</AccordionTrigger>
                <AccordionContent>
                  <InboxCollectionGroupCard
                    group={collectionGroup}
                    buyerId={buyerId}
                    expanded
                    historyEvents={history.data?.events}
                    localEvents={localEvents}
                    onToggle={() => {}}
                  />
                </AccordionContent>
              </AccordionItem>
            ) : null}
            {nonCollectionEntries.map((entry) => (
              <AccordionItem key={entry.id} value={entry.id}>
                <AccordionTrigger aria-label={ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}>
                  {ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}
                </AccordionTrigger>
                <AccordionContent>
                  {entry.entry_type === 'business_approval' || entry.entry_type === 'new_user_login' ? (
                    <>
                      <InboxApprovalDocuments entryId={entry.id} />
                      <InboxApprovalActionBar
                        entry={entry}
                        tenantId={tenantId}
                        historyEvents={history.data?.events}
                        localEvents={localEvents}
                        applyLocalAction={applyLocalAction}
                      />
                    </>
                  ) : (
                    <>
                    {entry.entry_type === 'new_enquiry' ? <InboxEnquiryPanel entryId={entry.id} /> : null}
                    <InboxActionBar
                      entry={entry}
                      tenantId={tenantId}
                      historyEvents={history.data?.events}
                      localEvents={localEvents}
                      applyLocalAction={applyLocalAction}
                    />
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      <InboxHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        buyerId={buyerId}
        buyerName={buyerName}
        localEvents={localEvents}
      />
    </div>
  );
}
