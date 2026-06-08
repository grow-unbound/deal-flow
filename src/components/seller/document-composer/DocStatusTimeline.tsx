'use client';

import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export type DocTimelineStepState = 'complete' | 'current' | 'pending' | 'terminal';

export interface DocTimelineStep {
  id: string;
  label: string;
  subtext?: string | null;
  state: DocTimelineStepState;
  terminalTone?: 'danger' | 'neutral';
}

export function DocStatusTimeline({ ariaLabel, steps }: { ariaLabel: string; steps: DocTimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="doc-status-timeline w-full min-w-0 px-0.5">
      <div className="flex w-full items-start" role="list" aria-label={ariaLabel}>
        {steps.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 ? (
              <div
                className={cn(
                  'doc-status-timeline__connector mt-[13px] h-0.5 min-w-2 flex-1 shrink',
                  steps[i - 1]!.state === 'complete' ? 'bg-teal-400' : 'bg-cream-200',
                )}
                aria-hidden
              />
            ) : null}
            <div className="doc-status-timeline__node flex w-[4.75rem] shrink-0 flex-col items-center text-center sm:w-[6.25rem]">
              <div
                className={cn(
                  'relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  step.state === 'complete' && 'border-success-600 bg-success-600 text-white shadow-sm',
                  step.state === 'current'
                    && step.terminalTone === 'danger'
                    && 'border-danger-500 bg-danger-50 text-danger-700',
                  step.state === 'current'
                    && step.terminalTone === 'neutral'
                    && 'border-cream-400 bg-cream-100 text-cream-800',
                  step.state === 'current'
                    && !step.terminalTone
                    && 'border-amber-500 bg-white text-amber-900 shadow-[0_1px_3px_rgba(34,52,43,0.12)]',
                  step.state === 'pending' && 'border-cream-300 bg-white text-cream-400',
                  step.state === 'terminal' && step.terminalTone === 'danger' && 'border-danger-400 bg-danger-50 text-danger-700',
                  step.state === 'terminal' && step.terminalTone === 'neutral' && 'border-cream-400 bg-cream-100 text-cream-700',
                )}
              >
                {step.state === 'complete' ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
                {step.state === 'current' && !step.terminalTone ? (
                  <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden />
                ) : null}
                {step.state === 'current' && step.terminalTone ? (
                  <span className="text-[10px] font-bold leading-none">!</span>
                ) : null}
                {step.state === 'terminal' ? (
                  <span className="text-[10px] font-bold leading-none">●</span>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-tight text-cream-900 sm:text-xs">{step.label}</p>
              {step.subtext ? (
                <p className="mt-0.5 text-[10px] leading-snug text-cream-600 sm:text-[11px]">{step.subtext}</p>
              ) : (
                <p className="mt-0.5 min-h-[14px] text-[10px] sm:text-[11px]" aria-hidden>
                  {' '}
                </p>
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function DocStatusWhatsNext({
  description,
  action,
}: {
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="doc-status-whats-next mt-5 border-t border-dotted border-cream-300 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cream-500">What&apos;s next</p>
          <div className="mt-1.5 text-[13px] leading-relaxed text-cream-800">{description}</div>
        </div>
        {action ? <div className="flex shrink-0 flex-col items-stretch justify-center sm:items-end">{action}</div> : null}
      </div>
    </div>
  );
}
