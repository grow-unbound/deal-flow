'use client';

import { useState } from 'react';
import { useCustomerPriceLists } from '@/hooks/useCustomersLanding';
import { Button } from '@/components/ui/button';
import { StatusTag } from '@/components/seller/layout';

function formatValidityWindow(validFrom: string | null, validTo: string | null) {
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Open';

  return `${formatDate(validFrom)} → ${formatDate(validTo)}`;
}

function PriceListStatusPill({ status }: { status: 'active' | 'draft' | 'expired' }) {
  if (status === 'active') return <StatusTag label="Active" tone="success" />;
  if (status === 'draft') return <StatusTag label="Draft" tone="warning" />;
  return <StatusTag label="Expired" tone="neutral" />;
}

export function CustomerPriceListsTab({ buyerId }: { buyerId: string }) {
  const [page, setPage] = useState(0);
  const query = useCustomerPriceLists(buyerId, page);
  const rows = query.data?.assigned ?? [];
  const total = query.data?.total ?? 0;

  return (
    <section className="mt-5">
      <div className="rounded-t-[14px] border border-cream-300 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-md text-cream-950">Assigned price lists</h3>
            <p className="mt-1 text-sm text-cream-600">Buyer-specific, cohort, and all-buyer pricing assignments.</p>
          </div>
          <p className="text-sm text-cream-600">
            {rows.length} of {total}
            {query.isFetching ? ' · Updating' : ''}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        {query.isLoading && !query.data ? (
          <div className="h-[320px] animate-pulse bg-cream-50" />
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-cream-500">
            No price lists are assigned to this buyer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-cream-200">
              <thead className="bg-cream-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">
                  <th className="px-4 py-3">Price list</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Validity</th>
                  <th className="px-4 py-3 text-right">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {rows.map((row) => (
                  <tr key={`${row.id}-${row.target_type}`} className="bg-white text-sm text-cream-900">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-cream-700">{row.target_label}</td>
                    <td className="px-4 py-3"><PriceListStatusPill status={row.status} /></td>
                    <td className="px-4 py-3 text-cream-700">{formatValidityWindow(row.valid_from, row.valid_to)}</td>
                    <td className="px-4 py-3 text-right font-mono text-cream-700">{row.priority ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > 50 ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total || query.isFetching} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
