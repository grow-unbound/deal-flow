'use client';

import { formatCompactInr } from '@/lib/utils';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { TransactionTable, type TransactionTableKind } from '@/components/seller/transactional';

interface CustomerOrdersTabProps {
  kind?: TransactionTableKind;
  orders: Array<{
    id: string;
    order_number?: string | null;
    number?: string | null;
    estimate_number?: string | null;
    invoice_number?: string | null;
    buyer_name?: string | null;
    placed_at?: string | null;
    issued_at?: string | null;
    created_at?: string | null;
    expires_at?: string | null;
    due_date?: string | null;
    location_name?: string | null;
    place_of_supply?: string | null;
    source_kind?: 'buyer_app' | 'converted' | 'direct' | 'seller';
    source_label?: string | null;
    campaign_name?: string | null;
    items?: number;
    items_count?: number;
    gmv?: number;
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

export function CustomerOrdersTab({
  kind = 'order',
  orders,
  title = 'Orders',
  description = 'All orders placed by this buyer',
  routeBase = '/sales-orders',
}: CustomerOrdersTabProps) {
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;

  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="border-b border-cream-300 px-5 py-4">
        <h3 className="font-display text-lg text-cream-950">{title}</h3>
        <p className="text-base text-cream-700">{description}</p>
      </div>

      {orders.length === 0 ? (
        <div className="py-12 text-center text-sm text-cream-500">No {title.toLowerCase()} found for this buyer.</div>
      ) : (
        <TransactionTable
          kind={kind}
          showCampaignColumn={showCampaignColumn}
          className="rounded-none border-0"
          tableMinWidth={showCampaignColumn ? (kind === 'invoice' ? 1480 : kind === 'estimate' ? 1450 : 1380) : kind === 'invoice' ? 1260 : kind === 'estimate' ? 1230 : 1180}
          rows={orders.map((row) => {
            const documentNumber =
              row.order_number ?? row.number ?? row.estimate_number ?? row.invoice_number ?? row.id.slice(0, 8);
            const itemsCount = row.items_count ?? row.items ?? 0;
            const totalAmount = Number(row.total_amount ?? row.gmv ?? 0);
            const createdAt = row.created_at ?? row.issued_at ?? row.placed_at ?? null;
            return {
              id: row.id,
              href: `${routeBase}/${row.id}`,
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
                  ? `${formatCompactInr(Number(row.outstanding_amount))} due`
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
