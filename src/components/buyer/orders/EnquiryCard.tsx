'use client';

import * as React from 'react';

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

const statusBadge: Record<EnquiryStatusKey, { bg: string; fg: string; label: string }> = {
  pending:  { bg: 'var(--info-50)',    fg: 'var(--info-500)',    label: 'Pending' },
  accepted: { bg: 'var(--success-50)', fg: 'var(--success-500)', label: 'Accepted' },
  declined: { bg: 'var(--danger-50)',  fg: 'var(--danger-500)',  label: 'Declined' },
};

function getBadge(status: string): { bg: string; fg: string; label: string } {
  return (
    statusBadge[status as EnquiryStatusKey] ?? statusBadge.pending
  );
}

export function EnquiryCard({ estimate }: EnquiryCardProps) {
  const badge = getBadge(estimate.status);
  const docNumber = estimate.estimate_number ?? `ENQ-${estimate.id.slice(0, 6).toUpperCase()}`;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'pointer',
      }}
    >
      {/* Row 1: estimate number + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            color: 'var(--fg-1)',
            letterSpacing: '0.02em',
          }}
        >
          {docNumber}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 100,
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Row 2: notes (if any) + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            fontSize: 12,
            color: 'var(--fg-3)',
            maxWidth: '60%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {estimate.notes ?? '—'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{formatDate(estimate.created_at)}</span>
      </div>

      {/* Row 3: total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span
          style={{
            fontSize: 15,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--fg-1)',
          }}
        >
          {inr(estimate.total_amount)}
        </span>
      </div>
    </div>
  );
}
