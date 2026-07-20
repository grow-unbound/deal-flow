'use client';

import { formatNumberValue } from '@/lib/utils';
import { ActivityCardShell } from './ActivityCardShell';
import type { StatusTone } from '@/components/ui/status-pill';
;

export interface EstimateSummary {
  id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  notes?: string | null;
}

interface EnquiryCardProps {
  estimate: EstimateSummary;
  href?: string;
  highlighted?: boolean;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type EnquiryStatusKey = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted' | 'invoiced' | 'void';

const statusBadge: Record<EnquiryStatusKey, { tone: StatusTone; label: string }> = {
  draft:     { tone: 'info', label: 'Draft' },
  sent:      { tone: 'warning', label: 'Sent' },
  accepted:  { tone: 'success', label: 'Accepted' },
  declined:  { tone: 'danger', label: 'Declined' },
  expired:   { tone: 'info', label: 'Expired' },
  converted: { tone: 'success', label: 'Converted' },
  invoiced:  { tone: 'success', label: 'Invoiced' },
  void:      { tone: 'danger', label: 'Void' },
};

function getBadge(status: string): { tone: StatusTone; label: string } {
  return statusBadge[status as EnquiryStatusKey] ?? { tone: 'info', label: status.replace(/_/g, ' ') };
}

export function EnquiryCard({ estimate, href, highlighted }: EnquiryCardProps) {
  const badge = getBadge(estimate.status);
  const docNumber = estimate.estimate_number ?? `ENQ-${estimate.id.slice(0, 6).toUpperCase()}`;

  return (
    <div
      style={
        highlighted
          ? { borderRadius: 12, boxShadow: '0 0 0 2px var(--teal-500), 0 0 0 5px rgba(0,163,163,0.15)', transition: 'box-shadow 0.2s' }
          : undefined
      }
    >
      <ActivityCardShell
        href={href}
        documentNumber={docNumber}
        statusLabel={badge.label}
        statusTone={badge.tone}
        middleLeft={estimate.notes ?? '—'}
        middleRight={<span className="tabular-inline">{formatDate(estimate.created_at)}</span>}
        amount={<span className="tabular-inline">{formatNumberValue(estimate.total_amount, 'CURRENCY_EXACT')}</span>}
      />
    </div>
  );
}
