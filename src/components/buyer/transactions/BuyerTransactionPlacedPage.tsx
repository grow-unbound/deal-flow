'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { markBuyerNavigationBack, navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { BuyerTransactionConfirmation, type BuyerTransactionKind } from '@/components/buyer/transactions/BuyerTransactionConfirmation';

interface BuyerTransactionPlacedPageProps {
  kind: BuyerTransactionKind;
  title: string;
  detailEndpoint: string;
  successHeading: string;
  successCopy: string;
  documentLabel: string;
}

export function BuyerTransactionPlacedPage({
  kind,
  title,
  detailEndpoint,
  successHeading,
  successCopy,
  documentLabel,
}: BuyerTransactionPlacedPageProps) {
  const router = useRouter();
  const params = useSearchParams();

  const id = params.get(kind === 'estimate' ? 'estimate_id' : 'order_id') ?? params.get('id') ?? '';
  const provisionalNumber =
    params.get(kind === 'estimate' ? 'estimate_number' : 'order_number')
    ?? params.get('num')
    ?? '';
  const initialStatusNote = params.get('document_status_note') ?? '';
  const total = Number(params.get('total') ?? '0');
  const initialDocumentUrl = params.get('document_url') ?? params.get(kind === 'estimate' ? 'estimate_url' : 'order_url') ?? '';
  const linkedEstimateNumber = kind === 'order' ? params.get('linked_estimate_number') : null;
  const linkedEstimateId = kind === 'order' ? params.get('linked_estimate_id') : null;

  function goToCatalog() {
    markBuyerNavigationBack();
    router.push('/buy/catalog');
  }

  function goToOrders() {
    markBuyerNavigationBack();
    const tab = kind === 'estimate' ? 'enquiries' : 'orders';
    const search = new URLSearchParams({ tab });
    if (id) search.set('highlight', id);
    router.push(`/buy/orders?${search.toString()}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)]">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4"
        style={{
          height: 'var(--header-h, 56px)',
          background: 'rgba(253, 251, 247, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <button
          type="button"
          onClick={() => navigateBuyerBack(router)}
          className="flex h-11 w-11 items-center justify-center p-0 text-[var(--cream-800)] transition-opacity active:opacity-60"
          aria-label="Go back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1
          className="font-semibold text-[var(--fg-1)]"
          style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
      </header>

      <main className="flex flex-1 flex-col">
        <BuyerTransactionConfirmation
          kind={kind}
          id={id}
          provisionalNumber={provisionalNumber}
          initialStatusNote={initialStatusNote}
          initialDocumentUrl={initialDocumentUrl}
          total={total}
          linkedEstimateNumber={linkedEstimateNumber}
          linkedEstimateId={linkedEstimateId}
          detailEndpoint={detailEndpoint}
          successHeading={successHeading}
          successCopy={successCopy}
          documentLabel={documentLabel}
          onGoToCatalog={goToCatalog}
          onGoToOrders={goToOrders}
        />
      </main>
    </div>
  );
}
