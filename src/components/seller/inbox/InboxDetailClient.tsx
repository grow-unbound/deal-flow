'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailActions, DetailHeader } from '@/components/seller/detail';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { useInboxEntries } from '@/hooks/useInboxEntries';
import { sortEntriesForStack, groupEntriesByDateAndCustomer } from '@/lib/inbox/inbox-grouping';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import { ENTRY_TYPE_LABEL, getInitials } from '@/lib/inbox/inbox-entry-copy';
import { InboxEntryCard } from './InboxEntryCard';
import { InboxActionBar } from './InboxActionBar';
import { InboxHistorySheet } from './InboxHistorySheet';
import { InboxRecordSheet } from './InboxRecordSheet';

export function InboxDetailClient({ buyerId }: { buyerId: string }) {
  const router = useRouter();
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
  const openCount = buyerEntries.length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col">
      <div className="shrink-0 px-4 py-4 md:px-6 md:py-4">
        {/* Today has no "closed" state — a customer is always open, so the pane's
            close (X) affordance (rendered automatically by DetailHeader whenever
            SplitPaneCloseContext is present) is suppressed here on purpose. */}
        <SplitPaneCloseContext.Provider value={null}>
          <DetailHeader
            avatar={{ kind: 'customer', initials: getInitials(buyerName), hue: 'cream' }}
            title={buyerName}
            status={{
              label: `${openCount} open issue${openCount === 1 ? '' : 's'}`,
              tone: openCount > 0 ? 'warning' : 'success',
            }}
            subtitle={[
              <button
                key="history"
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-1.5 text-cream-500 hover:text-cream-700"
              >
                <History className="h-3.5 w-3.5" aria-hidden />
                Show history
              </button>,
              buyerPhone ?? 'No phone on file',
            ]}
            actions={
              <DetailActions
                inline={
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRecordOpen(true)}>
                      View {buyerName}
                    </Button>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6">
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
                <AccordionTrigger aria-label={ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}>
                  {ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}
                </AccordionTrigger>
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
