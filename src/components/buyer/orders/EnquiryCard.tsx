'use client';

import { ActivityCardShell } from './ActivityCardShell';
import type { StatusTone } from '@/components/ui/status-pill';

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
}

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type EnquiryStatusKey = 'pending' | 'accepted' | 'declined';

const statusBadge: Record<EnquiryStatusKey, { tone: StatusTone; label: string }> = {
  pending:  { tone: 'info', label: 'Pending' },
  accepted: { tone: 'success', label: 'Accepted' },
  declined: { tone: 'danger', label: 'Declined' },
};

function getBadge(status: string): { tone: StatusTone; label: string } {
  return (
    statusBadge[status as EnquiryStatusKey] ?? statusBadge.pending
  );
}

export function EnquiryCard({ estimate }: EnquiryCardProps) {
  const badge = getBadge(estimate.status);
  const docNumber = estimate.estimate_number ?? `ENQ-${estimate.id.slice(0, 6).toUpperCase()}`;

  return (
    <ActivityCardShell
      documentNumber={docNumber}
      statusLabel={badge.label}
      statusTone={badge.tone}
      middleLeft={estimate.notes ?? '—'}
      middleRight={<span className="tabular-inline">{formatDate(estimate.created_at)}</span>}
      amount={<span className="tabular-inline">{inr(estimate.total_amount)}</span>}
    />
  );
}
