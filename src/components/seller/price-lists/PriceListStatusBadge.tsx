'use client';

import { getPriceListStatus, type PriceListStatus } from '@/lib/utils';
import { StatusTag } from '@/components/seller/layout';

interface PriceListStatusBadgeProps {
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

const STATUS_LABELS: Record<PriceListStatus, string> = {
  active:  'Active',
  draft:   'Draft',
  expired: 'Expired',
};

export function PriceListStatusBadge({ is_active, valid_from, valid_to }: PriceListStatusBadgeProps) {
  const status = getPriceListStatus({ is_active, valid_from, valid_to });
  const tone = status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
  return <StatusTag label={STATUS_LABELS[status]} tone={tone} />;
}
