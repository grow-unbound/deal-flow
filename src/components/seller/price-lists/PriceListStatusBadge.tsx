'use client';

import { getPriceListStatus, type PriceListStatus } from '@/lib/utils';

interface PriceListStatusBadgeProps {
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

const STATUS_STYLES: Record<PriceListStatus, string> = {
  active:    'bg-teal-100 text-teal-700',
  scheduled: 'bg-cream-200 text-cream-600',
  expired:   'bg-cream-300 text-cream-500',
  inactive:  'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<PriceListStatus, string> = {
  active:    'Active',
  scheduled: 'Scheduled',
  expired:   'Expired',
  inactive:  'Inactive',
};

export function PriceListStatusBadge({ is_active, valid_from, valid_to }: PriceListStatusBadgeProps) {
  const status = getPriceListStatus({ is_active, valid_from, valid_to });
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
