'use client';

import Link from 'next/link';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DocKind = 'estimate' | 'so' | 'invoice';

const KIND_META: Record<DocKind, { label: string; listName: string; listPath: string }> = {
  estimate: { label: 'Estimate', listName: 'Estimates', listPath: '/estimates' },
  so: { label: 'Sales order', listName: 'Sales orders', listPath: '/sales-orders' },
  invoice: { label: 'Invoice', listName: 'Invoices', listPath: '/invoices' },
};

export function DocTop({
  kind,
  docNumber,
  modeChip,
  statusChip,
  autoSave,
  onClose,
}: {
  kind: DocKind;
  docNumber: string | null;
  modeChip?: { tone: 'draft' | 'edit'; label: string };
  statusChip?: { className: string; label: string };
  autoSave?: { label: string; tone?: 'draft' | 'saved' | 'warning' };
  onClose?: () => void;
}) {
  const meta = KIND_META[kind];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-cream-300 bg-white px-5 py-3">
      <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-cream-600">
        <span>Sales</span>
        <span className="text-cream-400">/</span>
        <Link href={meta.listPath} className="hover:text-cream-900">
          {meta.listName}
        </Link>
        <span className="text-cream-400">/</span>
        <span className="font-medium text-cream-900">{docNumber ?? `New ${meta.label.toLowerCase()}`}</span>
      </nav>

      <span className={cn('doc-type-chip', `doc-type-chip--${kind}`)}>
        <span className="dot" />
        {meta.label}
      </span>

      {modeChip ? (
        <span className={cn('mode-chip', `mode-chip--${modeChip.tone}`)}>{modeChip.label}</span>
      ) : null}

      {statusChip ? (
        <span className={cn('doc-status-chip', statusChip.className)}>{statusChip.label}</span>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {autoSave ? (
          <span className="inline-flex items-center gap-2 text-[12px] text-cream-700">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                autoSave.tone === 'warning'
                  ? 'bg-amber-500'
                  : autoSave.tone === 'saved'
                    ? 'bg-teal-500'
                    : 'bg-cream-500',
              )}
            />
            {autoSave.label}
          </span>
        ) : null}

        <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={onClose}>
          <X className="h-4 w-4" />
          Close
        </Button>
      </div>
    </div>
  );
}
