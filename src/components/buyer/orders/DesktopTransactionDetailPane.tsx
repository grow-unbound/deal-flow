'use client';

import { useEffect, useState } from 'react';
import {
  ReorderButton,
  TransactionDetailDocumentBody,
  type DocType,
  type TransactionDoc,
} from '@/components/buyer/documents/TransactionDetailPage';
import { apiFetch } from '@/lib/api-fetch';
import { useBuyerMe } from '@/hooks/useBuyerMe';

interface DesktopTransactionDetailPaneProps {
  endpoint: string;
  emptyLabel: string;
  docType: DocType;
  respectBusinessPolicyTotals?: boolean;
  pickDoc: (payload: any) => TransactionDoc | null;
}

export function DesktopTransactionDetailPane({
  endpoint,
  emptyLabel,
  docType,
  respectBusinessPolicyTotals = false,
  pickDoc,
}: DesktopTransactionDetailPaneProps) {
  const { data: meData } = useBuyerMe();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<TransactionDoc | null>(null);
  const gstInclusive = meData?.business_policy.gst_inclusive ?? false;
  const gstRate = meData?.business_policy.gst_rate ?? 18;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);

    apiFetch(endpoint)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? 'Failed to load details');
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setDoc(pickDoc(payload));
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load details');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, pickDoc]);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 space-y-4 overflow-hidden px-5 py-5">
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded-full bg-cream-200" />
            <div className="flex items-start justify-between gap-3">
              <div className="h-8 w-48 animate-pulse rounded bg-cream-200" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-cream-200" />
            </div>
            <div className="h-4 w-56 animate-pulse rounded-full bg-cream-200" />
          </div>
          <div className="h-56 animate-pulse rounded-[18px] border border-cream-200 bg-cream-100" />
          <div className="h-32 animate-pulse rounded-[18px] border border-cream-200 bg-cream-100" />
          <div className="h-24 animate-pulse rounded-[18px] border border-cream-200 bg-cream-100" />
        </div>
        <div className="border-t border-cream-200 px-5 py-4">
          <div className="h-11 w-full animate-pulse rounded-xl bg-cream-200" />
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-cream-600">
        {error ?? emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-7">
        <TransactionDetailDocumentBody
          doc={doc}
          docType={docType}
          gstInclusive={gstInclusive}
          gstRate={gstRate}
          respectBusinessPolicyTotals={respectBusinessPolicyTotals}
        />
      </div>

      <div className="flex justify-end border-t border-cream-200 px-5 py-4">
        <div className="w-full max-w-[180px]">
          <ReorderButton items={doc.items} docType={docType} className="rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}
