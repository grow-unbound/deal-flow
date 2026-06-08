'use client';

import type { ReactNode } from 'react';

import {
  ComposerBodyGrid,
  ComposerBreadcrumbs,
  ComposerFooterBar,
  ComposerShell,
  ComposerTitleRow,
} from '@/components/seller/composer/ComposerLayout';
import { PageWrap } from '@/components/seller/layout';
import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import { cn } from '@/lib/utils';

export interface DocumentComposerBreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export function DocumentComposerShell({
  mode,
  kind,
  breadcrumbItems,
  title,
  subtitle,
  status,
  titleActions,
  statusBand,
  basics,
  left,
  center,
  right,
  footer,
}: {
  mode: 'create' | 'edit' | 'view';
  kind: 'estimate' | 'so' | 'invoice';
  breadcrumbItems: DocumentComposerBreadcrumbItem[];
  title: string;
  subtitle: string;
  status?: { label: string; tone?: 'draft' | 'live'; chipClassName?: string };
  titleActions?: ReactNode;
  statusBand?: ReactNode;
  basics: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <PageWrap className={cn('flex flex-col', composerPageMinHeightClass, 'pt-7 pb-6')}>
      <ComposerShell>
        <div className={cn('flex min-h-0 flex-1 flex-col gap-4', mode === 'view' && 'doc-readonly')} data-doc-kind={kind}>
          <ComposerBreadcrumbs items={breadcrumbItems} />

          <ComposerTitleRow
            title={title}
            subtitle={subtitle}
            status={status}
            actions={titleActions}
          />

          {statusBand}

          {basics}

          <ComposerBodyGrid left={left} center={center} right={right} />
        </div>

        {mode !== 'view' && footer ? <ComposerFooterBar>{footer}</ComposerFooterBar> : null}
      </ComposerShell>
    </PageWrap>
  );
}

export function DocumentComposerLoadingSkeleton({
  showStatusBand = false,
}: {
  showStatusBand?: boolean;
}) {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading document composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        {showStatusBand ? (
          <div className="doc-status-band flex min-h-[120px] flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="h-2 w-full animate-pulse rounded-full bg-cream-200" />
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
                  <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
                  <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-cream-200 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-2.5 w-24 animate-pulse rounded bg-cream-200" />
                  <div className="h-3 max-w-md animate-pulse rounded bg-cream-200" />
                  <div className="h-3 w-full max-w-sm animate-pulse rounded bg-cream-200" />
                </div>
                <div className="h-9 w-36 shrink-0 animate-pulse rounded-[9px] bg-cream-200" />
              </div>
            </div>
          </div>
        ) : null}
        <div className="doc-strip">
          <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="border-b border-cream-300 px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0">
                <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                <div className="mt-3 h-9 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              </div>
            ))}
          </div>
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white p-4" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 shrink-0 rounded-[14px] border border-cream-300 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(34,52,43,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-10 w-32 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
