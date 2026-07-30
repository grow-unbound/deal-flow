'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatusTag, type StatusTone } from '@/components/seller/layout';
import { cn } from '@/lib/utils';

export interface TransactionalPageHeadStatusPill {
  label: string;
  tone: StatusTone;
}

export interface TransactionalPageHeadSecondaryAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export interface TransactionalPageHeadDangerAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export interface TransactionalPageHeadProps {
  docTypeLabel: string;
  /** Override doc-type label tone (e.g. overdue → text-danger-600). */
  docTypeLabelClassName?: string;
  idLine: string;
  title: string;
  statusPill: TransactionalPageHeadStatusPill;
  subtitle: ReactNode[];
  secondaryActions: TransactionalPageHeadSecondaryAction[];
  dangerAction?: TransactionalPageHeadDangerAction;
}

export function TransactionalPageHead({
  docTypeLabel,
  docTypeLabelClassName = 'text-cream-600',
  idLine,
  title,
  statusPill,
  subtitle,
  secondaryActions,
  dangerAction,
}: TransactionalPageHeadProps) {
  const DangerIcon = dangerAction?.icon;

  return (
    <div className="mb-5 flex items-start justify-between gap-6 border-b border-cream-300 pb-5">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <span className="font-mono text-base text-cream-600">{idLine}</span>
          <span className={cn('eyebrow shrink-0', docTypeLabelClassName)}>
            {docTypeLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl md:text-2xl font-extrabold tracking-[-0.02em] text-cream-950 leading-[1.05]">{title}</h1>
          <StatusTag label={statusPill.label} tone={statusPill.tone} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-base text-cream-700">
          {subtitle.flatMap((item, index) => {
            const nodes = [
              <span key={`sub-${index}`} className="inline-flex items-center">
                {item}
              </span>,
            ];
            if (index > 0) {
              nodes.unshift(
                <span key={`dot-${index}`} className="text-cream-500">
                  ·
                </span>
              );
            }
            return nodes;
          })}
        </div>
      </div>
      <div className="flex max-w-[460px] shrink-0 flex-wrap items-center justify-end gap-2">
        {secondaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              className="cockpit-btn cockpit-btn-ghost cockpit-btn-sm text-cream-800"
              onClick={action.onClick}
            >
              <Icon className="h-[13px] w-[13px]" aria-hidden />
              <span>{action.label}</span>
            </button>
          );
        })}
        {dangerAction && DangerIcon ? (
          <button
            type="button"
            className="cockpit-btn cockpit-btn-ghost cockpit-btn-sm text-danger-700 hover:bg-danger-50 hover:text-danger-800"
            onClick={dangerAction.onClick}
          >
            <DangerIcon className="h-[13px] w-[13px]" aria-hidden />
            <span>{dangerAction.label}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
