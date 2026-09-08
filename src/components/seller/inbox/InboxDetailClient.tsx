'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useInboxEntries } from '@/hooks/useInboxEntries';
import { sortEntriesForStack, groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { InboxEntryCard } from './InboxEntryCard';
import { InboxActionBar } from './InboxActionBar';
import { InboxHistorySheet } from './InboxHistorySheet';
import { InboxRecordSheet } from './InboxRecordSheet';

export function InboxDetailClient({ buyerId }: { buyerId: string }) {
  const router = useRouter();
  const closePane = useContext(SplitPaneCloseContext);
  const { data } = useInboxEntries('active');
  const { overrides, localEvents, applyLocalAction } = useLocalEntryActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
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
          .filter((e) => e.buyer_id === buyerId)
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

  if (buyerEntries.length === 0) {
    return <div className="p-6 text-sm text-cream-500">This item is no longer in your active list.</div>;
  }

  const buyerName = buyerEntries[0].buyer_name;
  const buyerPhone = buyerEntries[0].buyer_phone;
  const tenantId = buyerEntries[0].tenant_id;
  const singleItem = buyerEntries.length === 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-cream-200 px-6 py-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-cream-950">{buyerName}</h1>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-cream-500 hover:text-cream-700"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Show history
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-sm font-medium text-cream-700 hover:bg-cream-100"
          >
            View {buyerName}
          </button>
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
          {closePane ? (
            <button
              type="button"
              onClick={closePane}
              aria-label="Close detail pane"
              className="p-2 text-cream-600 hover:bg-cream-100"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {singleItem ? (
          <InboxEntryCard
            entry={buyerEntries[0]}
            expanded
            onToggle={() => {}}
            tenantId={tenantId}
            applyLocalAction={applyLocalAction}
          />
        ) : isDesktop ? (
          <div className="space-y-4">
            {buyerEntries.map((entry) => (
              <InboxEntryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                tenantId={tenantId}
                applyLocalAction={applyLocalAction}
              />
            ))}
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={expandedId ?? undefined}
            onValueChange={(value) => setExpandedId(value || null)}
          >
            {buyerEntries.map((entry) => (
              <AccordionItem key={entry.id} value={entry.id}>
                <AccordionTrigger aria-label={entry.summary}>{entry.summary}</AccordionTrigger>
                <AccordionContent>
                  <InboxActionBar entry={entry} tenantId={tenantId} applyLocalAction={applyLocalAction} />
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
      <InboxRecordSheet
        open={recordOpen}
        onOpenChange={setRecordOpen}
        buyerId={buyerId}
        buyerName={buyerName}
        buyerPhone={buyerPhone}
      />
    </div>
  );
}
