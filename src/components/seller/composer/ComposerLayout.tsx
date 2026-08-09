'use client';

import { useContext, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { composerThreePanelGridClass, composerTwoPanelGridClass } from '@/lib/composer-viewport-classes';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';
import { cn } from '@/lib/utils';

export function ComposerShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4', className)}>{children}</div>;
}

export function ComposerTitleRow({
  title,
  subtitle,
  titleLeading,
  status,
  actions,
  onRequestClose,
}: {
  title: string;
  subtitle: string;
  titleLeading?: ReactNode;
  status?: {
    label: string;
    tone?: 'draft' | 'live';
    /** When set, uses shared document status chip styles (matches detail band palette). */
    chipClassName?: string;
  };
  actions?: React.ReactNode;
  onRequestClose?: () => void;
}) {
  const closePane = useContext(SplitPaneCloseContext);
  const requestClose = onRequestClose ?? closePane;
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {titleLeading}
          <h1 className="font-display text-lg md:text-xl font-extrabold tracking-[-0.025em] text-cream-950 leading-[1.05]">{title}</h1>
          {status ? (
            status.chipClassName ? (
              <span className={cn('doc-status-chip inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]', status.chipClassName)}>
                <span className="dot" aria-hidden />
                {status.label}
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]',
                  status.tone === 'live'
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-cream-300 bg-cream-100 text-cream-700',
                )}
              >
                {status.label}
              </span>
            )
          ) : null}
        </div>
        <p className="mt-1.5 max-w-[72ch] text-base leading-[1.55] text-cream-700">{subtitle}</p>
      </div>

      {actions || requestClose ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {requestClose ? (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close detail pane"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cream-300 bg-white text-cream-600 shadow-sm transition-colors hover:bg-cream-100 hover:text-cream-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ComposerBasicsStrip({
  children,
  columnsClassName = 'lg:grid-cols-[1.6fr_1fr_0.9fr_1fr]',
}: {
  children: React.ReactNode;
  columnsClassName?: string;
}) {
  return (
    <div className={cn('grid gap-0 overflow-visible rounded-[14px] border border-cream-300 bg-white', columnsClassName)}>
      {children}
    </div>
  );
}

export function ComposerBasicsField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0', className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function ComposerBodyGrid({
  left,
  center,
  right,
  className,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(right ? composerThreePanelGridClass : composerTwoPanelGridClass, className)}>
      <div className="flex h-full min-h-0 flex-col">{left}</div>
      <div className="flex h-full min-h-0 min-w-0 flex-col">{center}</div>
      {right ? <div className="flex h-full min-h-0 flex-col">{right}</div> : null}
    </div>
  );
}

export function ComposerSidebarCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <aside className={cn('flex h-full min-h-0 flex-col rounded-[14px] border border-cream-300 bg-white p-4', className)}>{children}</aside>;
}

export function ComposerMainCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-cream-300 bg-white', className)}>
      {children}
    </section>
  );
}

export function ComposerPanelTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-300 px-5 py-4">
      <div className="min-w-0">
        <p className="text-base font-semibold text-cream-950">{title}</p>
        {subtitle ? <p className="mt-1 max-w-[38rem] text-sm leading-[1.5] text-cream-700">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ComposerFooterBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto rounded-[14px] border border-cream-300 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(34,52,43,0.06)]">
      {children}
    </div>
  );
}

export function ComposerSelectableRow({
  checked,
  onCheckedChange,
  className,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={cn('cursor-pointer border-b border-cream-300 bg-white transition-colors hover:bg-cream-50 last:border-b-0', className)}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea, [role="button"], [data-row-click-ignore="true"]')) return;
        onCheckedChange(!checked);
      }}
    >
      {children}
    </tr>
  );
}

export function ComposerCheckboxCell({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <td className={cn('w-9 px-3 py-3 align-middle', className)} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="accent-teal-500"
        />
      </div>
    </td>
  );
}
