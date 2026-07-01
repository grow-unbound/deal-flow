'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { EntityAvatar, LandingTable, StatusTag } from '@/components/seller/layout';
import { cn, formatCompactInr, formatDate } from '@/lib/utils';

export type TransactionTableKind = 'estimate' | 'order' | 'invoice';
export type TransactionSourceKind = 'buyer_app' | 'converted' | 'direct' | 'seller';

export interface TransactionTableRow {
  id: string;
  href: string;
  document_number: string;
  source_kind: TransactionSourceKind;
  source_label: string | null;
  buyer_name: string;
  buyer_place_of_supply: string | null;
  buyer_initials?: string | null;
  buyer_hue?: 'teal' | 'ember' | 'cream' | null;
  location_name: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  amount_subtext?: string | null;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral';
  created_at: string | null;
  expires_at?: string | null;
  due_at?: string | null;
}

export interface TransactionTableProps {
  kind: TransactionTableKind;
  rows: TransactionTableRow[];
  showCampaignColumn: boolean;
  className?: string;
  tableClassName?: string;
  tableMinWidth?: number | string;
  rowClassName?: string;
  onRowClick?: (row: TransactionTableRow) => void;
}

function deriveInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function shouldShowSource(kind: TransactionTableKind, sourceKind: TransactionSourceKind) {
  if (kind === 'estimate') return sourceKind === 'buyer_app';
  return sourceKind === 'buyer_app' || sourceKind === 'converted';
}

function columnWidths(kind: TransactionTableKind, showCampaignColumn: boolean) {
  const base = {
    document: { width: 180, minWidth: 160, maxWidth: 200 },
    buyer: { width: 270, minWidth: 240, maxWidth: 300 },
    location: { width: 150, minWidth: 130, maxWidth: 170 },
    campaign: { width: 200, minWidth: 180, maxWidth: 260 },
    items: { width: 60, minWidth: 40, maxWidth: 80 },
    total: { width: 160, minWidth: 120, maxWidth: 180 },
    status: { width: 140, minWidth: 120, maxWidth: 160 },
    created: { width: 132, minWidth: 126, maxWidth: 150 },
    expires: { width: 132, minWidth: 126, maxWidth: 150 },
    due: { width: 132, minWidth: 126, maxWidth: 150 },
  } as const;

  if (kind === 'estimate') {
    return [
      { label: 'Estimate Number', ...base.document },
      { label: 'Buyer Name', ...base.buyer },
      { label: 'Location', ...base.location },
      ...(showCampaignColumn ? [{ label: 'Campaign', ...base.campaign }] : []),
      { label: 'Items', align: 'right' as const, ...base.items },
      { label: 'Total Amount', align: 'right' as const, ...base.total },
      { label: 'Status', ...base.status },
      { label: 'Created', ...base.created },
      { label: 'Expires', ...base.expires },
    ];
  }

  if (kind === 'order') {
    return [
      { label: 'Order Number', ...base.document },
      { label: 'Buyer Name', ...base.buyer },
      { label: 'Location', ...base.location },
      ...(showCampaignColumn ? [{ label: 'Campaign', ...base.campaign }] : []),
      { label: 'Items', align: 'right' as const, ...base.items },
      { label: 'Total Amount', align: 'right' as const, ...base.total },
      { label: 'Status', ...base.status },
      { label: 'Created', ...base.created },
    ];
  }

  return [
    { label: 'Invoice Number', ...base.document },
    { label: 'Buyer Name', ...base.buyer },
    { label: 'Location', ...base.location },
    ...(showCampaignColumn ? [{ label: 'Campaign', ...base.campaign }] : []),
    { label: 'Items', align: 'right' as const, ...base.items },
    { label: 'Total Amount', align: 'right' as const, ...base.total },
    { label: 'Status', ...base.status },
    { label: 'Created', ...base.created },
    { label: 'Due', ...base.due },
  ];
}

export function TransactionTable({
  kind,
  rows,
  showCampaignColumn,
  className,
  tableClassName,
  tableMinWidth,
  rowClassName,
  onRowClick,
}: TransactionTableProps) {
  const router = useRouter();
  const columns = columnWidths(kind, showCampaignColumn);

  return (
    <LandingTable
      columns={columns}
      className={className}
      tableClassName={cn('v2-table', tableClassName)}
      tableMinWidth={tableMinWidth}
    >
      {rows.map((row) => {
        const showSource = shouldShowSource(kind, row.source_kind);
        const initials = row.buyer_initials ?? deriveInitials(row.buyer_name);
        const hue = row.buyer_hue ?? 'teal';
        const click = onRowClick ?? ((current: TransactionTableRow) => router.push(current.href));

        return (
          <tr
            key={row.id}
            className={cn('cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50', rowClassName)}
            onClick={() => click(row)}
          >
            <td className="px-5 py-3.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-cream-900">{row.document_number}</p>
                  {showSource && row.source_label ? (
                    <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-[0.08em] text-cream-600">
                      {row.source_label}
                    </p>
                  ) : null}
                </div>
              </div>
            </td>

            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <EntityAvatar initials={initials} hue={hue} size={30} />
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{row.buyer_name}</p>
                  <p className="mt-0.5 truncate text-xs text-cream-600">{row.buyer_place_of_supply ?? '—'}</p>
                </div>
              </div>
            </td>

            <td className="px-5 py-3.5 text-sm text-cream-900">{row.location_name ?? '—'}</td>

            {showCampaignColumn ? (
              <td className="px-5 py-3.5 text-sm text-cream-900">{row.campaign_name ?? '—'}</td>
            ) : null}

            <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.items_count}</td>

            <td className="px-5 py-3.5 text-right">
              <p className="font-display text-md text-cream-950">{formatCompactInr(row.total_amount)}</p>
              {kind === 'invoice' && row.amount_subtext ? (
                <p className="mt-0.5 text-xs text-cream-600">{row.amount_subtext}</p>
              ) : null}
            </td>

            <td className="px-5 py-3.5">
              <StatusTag label={row.status_label} tone={row.status_tone} />
            </td>

            <td className="px-5 py-3.5 font-mono text-sm text-cream-700">
              {row.created_at ? formatDate(row.created_at) : '—'}
            </td>

            {kind === 'estimate' ? (
              <td className="px-5 py-3.5 font-mono text-sm text-cream-700">
                {row.expires_at ? formatDate(row.expires_at) : '—'}
              </td>
            ) : null}

            {kind === 'invoice' ? (
              <td className="px-5 py-3.5 font-mono text-sm text-cream-700">
                {row.due_at ? formatDate(row.due_at) : '—'}
              </td>
            ) : null}
          </tr>
        );
      })}
    </LandingTable>
  );
}
