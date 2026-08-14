'use client';

import { formatNumberValue } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, FileText, ShoppingBag } from 'lucide-react';

import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { apiFetch } from '@/lib/api-fetch';
import { TRANSACTION_PENDING_NOTE } from '@/lib/transaction-notes';

export type BuyerTransactionKind = 'estimate' | 'order';

export interface BuyerTransactionConfirmationData {
  kind: BuyerTransactionKind;
  id: string;
  provisionalNumber: string;
  initialStatusNote: string;
  initialDocumentUrl: string;
  total: number;
  linkedEstimateNumber?: string | null;
  linkedEstimateId?: string | null;
}

interface BuyerTransactionConfirmationProps extends BuyerTransactionConfirmationData {
  detailEndpoint: string;
  successHeading: string;
  successCopy: string;
  documentLabel: string;
  onGoToCatalog: () => void;
  onGoToOrders: () => void;
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

/** Shared success content for order/estimate placement — the mobile full page
 * (`/buy/order-placed`, `/buy/estimate-placed`) wraps this with page chrome;
 * the desktop cart Sheet renders it in place, without navigating away. */
export function BuyerTransactionConfirmation({
  kind,
  id,
  provisionalNumber,
  initialStatusNote,
  initialDocumentUrl,
  total,
  linkedEstimateNumber,
  linkedEstimateId,
  detailEndpoint,
  successHeading,
  successCopy,
  documentLabel,
  onGoToCatalog,
  onGoToOrders,
}: BuyerTransactionConfirmationProps) {
  const { clearCart } = useCart();
  const { setRefreshFn } = useBuyerRealtimeContext();

  const [documentNumber, setDocumentNumber] = useState(provisionalNumber);
  const [documentUrl, setDocumentUrl] = useState(initialDocumentUrl);
  const [documentStatusNote, setDocumentStatusNote] = useState(
    provisionalNumber ? '' : initialStatusNote,
  );

  useEffect(() => {
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCanonicalDetail = useCallback(async () => {
    if (!id) return false;
    const res = await apiFetch(`${detailEndpoint}/${id}`, { fresh: true });
    if (!res.ok) return false;
    const json = (await res.json()) as BuyerTransactionDetailResponse;
    const fields = getDocumentFields(kind, json);
    if (fields.number) {
      setDocumentNumber(fields.number);
      setDocumentStatusNote('');
    } else if (fields.statusNote) {
      setDocumentStatusNote(fields.statusNote);
    }
    if (fields.documentUrl) setDocumentUrl(fields.documentUrl);
    return Boolean(fields.number || fields.documentUrl);
  }, [detailEndpoint, id, kind]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const maxAttempts = 4;
    const retryDelayMs = 1500;

    async function pollCanonicalDetail() {
      attempt += 1;
      if (cancelled) return;
      const ready = await loadCanonicalDetail();
      if (!ready && attempt < maxAttempts) {
        retryTimer = setTimeout(() => {
          void pollCanonicalDetail();
        }, retryDelayMs);
      }
    }

    void pollCanonicalDetail();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [id, loadCanonicalDetail]);

  useEffect(() => {
    if (!id) return;
    setRefreshFn(async () => {
      await loadCanonicalDetail();
    });
    return () => setRefreshFn(null);
  }, [id, loadCanonicalDetail, setRefreshFn]);

  const linkLabel = useMemo(
    () => (kind === 'estimate' ? 'View Estimate PDF' : 'View Order PDF'),
    [kind],
  );
  const documentDisplayValue = documentNumber || documentStatusNote || TRANSACTION_PENDING_NOTE;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center px-4 py-6 text-center">
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

      {linkedEstimateNumber ? (
        <div className="mt-3 w-full rounded-[12px] border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3.5 text-left">
          <p className="text-[var(--b-text-sub)] text-[var(--fg-3)]">
            Out-of-stock items were submitted separately as an Enquiry.
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-4">
            <span className="text-[var(--b-text-label)] font-medium text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {linkedEstimateNumber}
            </span>
            {linkedEstimateId ? (
              <Link
                href={`/buy/estimates/${linkedEstimateId}`}
                className="inline-flex items-center gap-1 text-[var(--b-text-sub)] font-medium text-[var(--teal-600)]"
              >
                View Enquiry
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={onGoToCatalog}>
          <ShoppingBag className="h-4 w-4" />
          Go to Catalog
        </Button>
        <Button type="button" className="h-12 gap-2" onClick={onGoToOrders}>
          <FileText className="h-4 w-4" />
          Go to Orders
        </Button>
      </div>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return <StatusPill label={label} tone="warning" className="text-[length:var(--b-text-sub)]" />;
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
