'use client';

import type { ReactNode } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ComposerModeTone = 'draft' | 'live';

export interface ComposerCrumb {
  label: string;
  href?: string;
  current?: boolean;
}

export function ComposerShell({
  crumbs,
  modeChip,
  draftState,
  title,
  subtitle,
  topActions,
  basics,
  filters,
  content,
  summary,
  footer,
  onClose,
}: {
  crumbs: ComposerCrumb[];
  modeChip?: { label: string; tone: ComposerModeTone };
  draftState?: string;
  title: string;
  subtitle: ReactNode;
  topActions?: ReactNode;
  basics: ReactNode;
  filters: ReactNode;
  content: ReactNode;
  summary: ReactNode;
  footer: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col rounded-[22px] border border-cream-300 bg-white shadow-[0_20px_45px_rgba(34,52,43,0.08)]">
      <div className="flex items-center gap-3 border-b border-cream-200 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-cream-700">
          {crumbs.map((crumb, index) => (
            <div key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
              <span className={cn('truncate', crumb.current ? 'font-medium text-cream-950' : '')}>{crumb.label}</span>
              {index < crumbs.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-cream-400" /> : null}
            </div>
          ))}
        </div>
        {modeChip ? (
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
              modeChip.tone === 'live'
                ? 'border-teal-200 bg-teal-50 text-teal-700'
                : 'border-cream-300 bg-cream-100 text-cream-700',
            )}
          >
            {modeChip.label}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {draftState ? (
            <span className="inline-flex items-center gap-2 text-sm text-cream-600">
              <span className="h-2 w-2 rounded-full bg-teal-400" />
              {draftState}
            </span>
          ) : null}
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-cream-200 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-cream-950 leading-[1.05]">
              {title}
            </h1>
            <div className="max-w-[68ch] text-base leading-[1.6] text-cream-700">{subtitle}</div>
          </div>
          {topActions ? <div className="flex items-center gap-2">{topActions}</div> : null}
        </div>
        <div className="mt-5">{basics}</div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px] gap-0">
        <div className="border-r border-cream-200 bg-cream-50">{filters}</div>
        <div className="min-w-0">{content}</div>
        <div className="border-l border-cream-200 bg-cream-50">{summary}</div>
      </div>

      <div className="border-t border-cream-200 bg-white px-6 py-4">{footer}</div>
    </div>
  );
}

export function ComposerBasicsStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function ComposerBasicField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[16px] border border-cream-300 bg-cream-50 p-4', className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">{label}</p>
      {children}
    </div>
  );
}

export function ComposerPanelTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
      <div>
        <h2 className="text-md font-semibold text-cream-950">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-[1.55] text-cream-700">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
