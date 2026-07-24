'use client';

import { formatNumberValue } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, CheckCircle2, ChevronLeft, FileText, ShoppingBag } from 'lucide-react';

import { useCart } from '@/contexts/BuyerCartContext';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { apiFetch } from '@/lib/api-fetch';
import { markBuyerNavigationBack, navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { TRANSACTION_PENDING_NOTE } from '@/lib/transaction-notes';
;

type BuyerTransactionKind = 'estimate' | 'order';

interface BuyerTransactionPlacedPageProps {
  kind: BuyerTransactionKind;
  title: string;
  detailEndpoint: string;
  successHeading: string;
  successCopy: string;
  documentLabel: string;
}

interface BuyerTransactionDetailResponse {
  estimate?: {
    estimate_number: string | null;
    document_status_note?: string | null;
    document_url?: string | null;
    estimate_url?: string | null;
  };
  order?: {
    order_number: string | null;
    document_status_note?: string | null;
    document_url?: string | null;
    order_url?: string | null;
  };
}

function getDocumentFields(kind: BuyerTransactionKind, payload: BuyerTransactionDetailResponse | null) {
  if (!payload) return { number: null, documentUrl: null, statusNote: null };
  if (kind === 'estimate') {
    return {
      number: payload.estimate?.estimate_number ?? null,
      statusNote: payload.estimate?.document_status_note ?? null,
      documentUrl: payload.estimate?.document_url ?? payload.estimate?.estimate_url ?? null,
    };
  }
  return {
    number: payload.order?.order_number ?? null,
    statusNote: payload.order?.document_status_note ?? null,
    documentUrl: payload.order?.document_url ?? payload.order?.order_url ?? null,
  };
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
  const { clearCart } = useCart();

  const id = params.get(kind === 'estimate' ? 'estimate_id' : 'order_id') ?? params.get('id') ?? '';
  const provisionalNumber =
    params.get(kind === 'estimate' ? 'estimate_number' : 'order_number')
    ?? params.get('num')
    ?? '';
  const initialStatusNote = params.get('document_status_note') ?? '';
  const total = Number(params.get('total') ?? '0');
  const initialDocumentUrl = params.get('document_url') ?? params.get(kind === 'estimate' ? 'estimate_url' : 'order_url') ?? '';

  const [documentNumber, setDocumentNumber] = useState(provisionalNumber);
  const [documentUrl, setDocumentUrl] = useState(initialDocumentUrl);
  const [documentStatusNote, setDocumentStatusNote] = useState(
    provisionalNumber ? '' : initialStatusNote,
  );

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const maxAttempts = 4;
    const retryDelayMs = 1500;

    async function loadCanonicalDetail() {
      attempt += 1;
      const res = await apiFetch(`${detailEndpoint}/${id}`);
      if (!res.ok) return;
      const json = (await res.json()) as BuyerTransactionDetailResponse;
      if (cancelled) return;
      const fields = getDocumentFields(kind, json);
      if (fields.number) {
        setDocumentNumber(fields.number);
        setDocumentStatusNote('');
      } else if (fields.statusNote) {
        setDocumentStatusNote(fields.statusNote);
      }
      if (fields.documentUrl) setDocumentUrl(fields.documentUrl);
      if (!fields.documentUrl && attempt < maxAttempts) {
        retryTimer = setTimeout(() => {
          void loadCanonicalDetail();
        }, retryDelayMs);
      }
    }

    void loadCanonicalDetail();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [detailEndpoint, id, kind]);

  useEffect(() => {
    if (!id) return;

    const table = kind === 'estimate' ? 'estimates' : 'orders';
    const numberField = kind === 'estimate' ? 'estimate_number' : 'order_number';
    const urlField = kind === 'estimate' ? 'estimate_url' : 'order_url';

    const channel = supabaseBrowser
      .channel(`buyer-transaction-placed:${kind}:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table, filter: `id=eq.${id}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const nextNumber = record[numberField] as string | null | undefined;
          const nextUrl = (record.document_url ?? record[urlField]) as string | null | undefined;
          if (nextNumber?.trim()) {
            setDocumentNumber(nextNumber);
            setDocumentStatusNote('');
          }
          if (nextUrl?.trim()) setDocumentUrl(nextUrl);
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [id, kind]);

  const linkLabel = useMemo(
    () => (kind === 'estimate' ? 'View Estimate PDF' : 'View Order PDF'),
    [kind],
  );
  const documentDisplayValue = documentNumber || documentStatusNote || TRANSACTION_PENDING_NOTE;

  const ordersHref = useMemo(() => {
    const tab = kind === 'estimate' ? 'enquiries' : 'orders';
    const search = new URLSearchParams({ tab });
    if (id) search.set('highlight', id);
    return `/buy/orders?${search.toString()}`;
  }, [id, kind]);

  function goToCatalog() {
    markBuyerNavigationBack();
    router.push('/buy/catalog');
  }

  function goToOrders() {
    markBuyerNavigationBack();
    router.push(ordersHref);
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] p-0 text-[var(--cream-800)] transition-colors active:bg-[var(--cream-100)]"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1
          className="font-semibold text-[var(--fg-1)]"
          style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
      </header>

      <main className="flex flex-1 flex-col px-4 py-6">
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center text-center">
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border"
            style={{ background: 'var(--ember-50)', borderColor: 'var(--ember-200)' }}
          >
            <CheckCircle2 className="h-10 w-10" style={{ color: 'var(--ember-400)' }} />
          </div>

          <h2
            className="text-[var(--fg-1)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--b-text-page)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
            }}
          >
            {successHeading}
          </h2>
          <p className="mt-2 max-w-md text-[var(--b-text-body)] text-[var(--fg-3)]">
            {successCopy}
          </p>

          <div className="mt-8 w-full rounded-[12px] border border-[var(--border-1)] bg-[var(--bg-surface)] text-left">
            <div className="border-b border-[var(--border-1)] px-4 py-3" style={{ background: 'var(--cream-50)' }}>
              <p className="font-semibold uppercase tracking-[0.18em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                {documentLabel}
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <ReceiptRow label={`${documentLabel} #`} value={documentDisplayValue} mono={Boolean(documentNumber)} />
              <ReceiptRow label="Status" value={<StatusChip label="Received" />} />
              {total > 0 ? <ReceiptRow label="Total" value={formatNumberValue(total, 'CURRENCY_EXACT')} mono /> : null}
              {documentUrl ? (
                <Button asChild variant="outline" className="mt-1 h-10 gap-2 self-start">
                  <a href={documentUrl} target="_blank" rel="noreferrer">
                    <FileText className="h-4 w-4" />
                    {linkLabel}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-12 gap-2" onClick={goToCatalog}>
              <ShoppingBag className="h-4 w-4" />
              Go to Catalog
            </Button>
            <Button type="button" className="h-12 gap-2" onClick={goToOrders}>
              <FileText className="h-4 w-4" />
              Go to Orders
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return <StatusPill label={label} tone="warning" className="text-[11px]" />;
}

function ReceiptRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--b-text-label)] text-[var(--fg-3)]">{label}</span>
      <span
        className="text-[var(--b-text-label)] font-medium text-[var(--fg-1)]"
        style={{ fontFamily: mono ? 'var(--font-mono)' : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
