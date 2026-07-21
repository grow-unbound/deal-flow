'use client';

import { formatNumberValue } from '@/lib/utils';
import * as React from 'react';

import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { ErrorState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface BuyerSimpleDocumentDetailProps<TDocument> {
  id: string;
  title: string;
  endpoint: string;
  pickRows: (payload: any) => TDocument[];
  match: (row: TDocument) => boolean;
  render: (row: TDocument) => React.ReactNode;
}

export function BuyerSimpleDocumentDetail<TDocument>({
  id,
  title,
  endpoint,
  pickRows,
  match,
  render,
}: BuyerSimpleDocumentDetailProps<TDocument>) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [document, setDocument] = React.useState<TDocument | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiFetch(endpoint)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const row = pickRows(payload).find(match) ?? null;
        setDocument(row);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `pickRows` and `match` are page-level constants keyed by `id`.
    // Re-running only when the route target changes avoids fetch loops from new function identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, id]);

  return (
    <div className="flex min-h-[50dvh] flex-col pb-[var(--tab-bar)]">
      <BuyerDetailShell title={title}>
        {loading ? (
          <div className="space-y-3 px-4 py-4">
            <div className={`h-32 animate-pulse border border-cream-200 bg-cream-100 ${BUYER_CARD_RADIUS_CLASS}`} />
            <div className={`h-40 animate-pulse border border-cream-200 bg-cream-100 ${BUYER_CARD_RADIUS_CLASS}`} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState
              heading={`Couldn't load ${title.toLowerCase()}`}
              description="Check your connection and try again."
              onRetry={() => {
                setDocument(null);
                setLoading(true);
                setError(false);
              }}
            />
          </div>
        ) : document ? (
          <div className="px-4 py-4">{render(document)}</div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">{title} not found.</div>
        )}
      </BuyerDetailShell>
    </div>
  );
}

export function BuyerDocumentStat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className={`border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-4 ${BUYER_CARD_RADIUS_CLASS}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--cream-600)]">{label}</p>
      <p className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--cream-900)]">{value}</p>
      {sub ? <p className="mt-2 text-sm text-[var(--cream-600)]">{sub}</p> : null}
    </div>
  );
}

export function BuyerAmount(value: number): string {
  return formatNumberValue(value, 'CURRENCY_EXACT');
}

export function BuyerDate(value: string | null | undefined): string {
  return fmtDate(value);
}
