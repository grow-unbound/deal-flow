'use client';

import type { ReactNode } from 'react';

import { PageWrap } from '@/components/seller/layout';
import { cn } from '@/lib/utils';

export function DocComposerFrame({
  mode = 'create',
  kind = 'estimate',
  statusBand,
  top,
  titleRow,
  strip,
  left,
  center,
  right,
  footer,
}: {
  mode?: 'create' | 'edit' | 'view';
  kind?: 'estimate' | 'so' | 'invoice';
  statusBand?: ReactNode;
  top: ReactNode;
  titleRow: ReactNode;
  strip: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <PageWrap className="max-w-[1440px]">
      <div className={cn('space-y-4', mode === 'view' && 'doc-readonly')} data-doc-kind={kind}>
        {top}
        {titleRow}
        {statusBand}
        {strip}
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {left}
          {center}
          {right}
        </div>
        {mode !== 'view' && footer}
      </div>
    </PageWrap>
  );
}
