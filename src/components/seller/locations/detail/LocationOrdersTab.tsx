'use client';

import { useFlagState } from '@/hooks/useFeatureFlag';
import { TransactionTable, type TransactionTableKind } from '@/components/seller/transactional';

interface LocationOrdersTabProps {
  kind?: TransactionTableKind;
  rows: Array<{
    order_id?: string;
    estimate_id?: string;
    invoice_id?: string;
    order_number?: string;
    estimate_number?: string;
    invoice_number?: string;
    placed_at?: string;
    issued_at?: string;
    expires_at?: string | null;
    due_date?: string | null;
    buyer_name?: string;
    place_of_supply?: string | null;
    location_name?: string | null;
    source_kind?: 'buyer_app' | 'converted' | 'direct' | 'seller';
    source_label?: string | null;
    campaign_name?: string | null;
    items_count?: number;
    total_amount?: number;
    outstanding_amount?: number;
    status: string;
  }>;
  title?: string;
  description?: string;
  routeBase?: string;
}

function statusTone(kind: TransactionTableKind, status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'order') {
    if (['confirmed', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced'].includes(status)) return 'success';
    if (status === 'cancelled') return 'danger';
    if (status === 'draft') return 'neutral';
    return 'warning';
  }
  if (kind === 'estimate') {
    if (['accepted', 'converted', 'invoiced'].includes(status)) return 'success';
    if (status === 'declined' || status === 'expired' || status === 'void') return 'danger';
    if (status === 'draft') return 'neutral';
    return 'warning';
  }
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'void') return 'neutral';
  if (status === 'draft') return 'neutral';
  return 'warning';
}

function titleCase(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function LocationOrdersTab({
  kind = 'order',
  rows,
  title = 'Orders',
  description = 'All orders placed at this location',
  routeBase = '/sales-orders',
}: LocationOrdersTabProps) {
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;

  return (
    <section className="mt-6 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="border-b border-cream-300 px-5 py-4">
        <h3 className="font-display text-lg text-cream-950">{title}</h3>
        <p className="text-base text-cream-700">{description}</p>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-cream-500">No {title.toLowerCase()} found for this location.</div>
      ) : (
        <TransactionTable
          kind={kind}
          showCampaignColumn={showCampaignColumn}
          className="rounded-none border-0"
          tableMinWidth={showCampaignColumn ? (kind === 'invoice' ? 1480 : kind === 'estimate' ? 1450 : 1380) : kind === 'invoice' ? 1260 : kind === 'estimate' ? 1230 : 1180}
          rows={rows.map((row) => {
            const documentNumber =
              row.order_number ?? row.estimate_number ?? row.invoice_number ?? row.order_id ?? row.estimate_id ?? row.invoice_id ?? '—';
            const itemsCount = row.items_count ?? 0;
            const totalAmount = Number(row.total_amount ?? 0);
            const createdAt = row.placed_at ?? row.issued_at ?? null;
            const href = `${routeBase}/${row.order_id ?? row.estimate_id ?? row.invoice_id ?? ''}`;
            return {
              id: row.order_id ?? row.estimate_id ?? row.invoice_id ?? documentNumber,
              href,
              document_number: documentNumber,
              source_kind: row.source_kind ?? (kind === 'estimate' ? 'seller' : 'direct'),
              source_label: row.source_label ?? null,
              buyer_name: row.buyer_name ?? 'Buyer',
              buyer_place_of_supply: row.place_of_supply ?? null,
              buyer_initials: null,
              buyer_hue: null,
              location_name: row.location_name ?? null,
              campaign_name: row.campaign_name ?? null,
              items_count: itemsCount,
              total_amount: totalAmount,
              amount_subtext:
                kind === 'invoice' && Number(row.outstanding_amount ?? 0) > 0
                  ? `${Number(row.outstanding_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} due`
                  : null,
              status_label: titleCase(row.status),
              status_tone: statusTone(kind, row.status),
              created_at: createdAt,
              expires_at: row.expires_at ?? null,
              due_at: row.due_date ?? null,
            };
          })}
        />
      )}
    </section>
  );
}
