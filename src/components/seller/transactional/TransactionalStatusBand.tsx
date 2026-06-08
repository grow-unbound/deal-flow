'use client';

import { Fragment } from 'react';
import { Check, ChevronRight, Plus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TransactionalStatusStepState =
  | 'done'
  | 'current'
  | 'current_danger'
  | 'future'
  | 'skipped'
  | 'cancelled';

export interface TransactionalStatusBandStep {
  label: string;
  state: TransactionalStatusStepState;
  timestamp?: string;
}

export interface TransactionalStatusBandPrimaryAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary';
  /** Defaults: primary → Plus, secondary → ChevronRight */
  icon?: LucideIcon;
}

export interface TransactionalStatusBandProps {
  steps: TransactionalStatusBandStep[];
  whatsnext: string;
  /** Omit when no primary CTA (e.g. void terminal state). */
  primaryAction?: TransactionalStatusBandPrimaryAction;
}

function StepNode({ state }: { state: TransactionalStatusStepState }) {
  if (state === 'done') {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white"
        aria-hidden
      >
        <Check className="h-3 w-3" strokeWidth={2.4} />
      </div>
    );
  }
  if (state === 'current') {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white ring-4 ring-amber-100 animate-pulse"
        aria-hidden
      />
    );
  }
  if (state === 'current_danger') {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-500 text-white ring-4 ring-danger-100 animate-pulse"
        aria-hidden
      />
    );
  }
  if (state === 'cancelled') {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-600"
        aria-hidden
      >
        <X className="h-3 w-3" strokeWidth={2.4} />
      </div>
    );
  }
  if (state === 'skipped') {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-cream-300 bg-cream-100 opacity-60"
        aria-hidden
      />
    );
  }
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-cream-300 bg-cream-100"
      aria-hidden
    />
  );
}

export function TransactionalStatusBand({ steps, whatsnext, primaryAction }: TransactionalStatusBandProps) {
  const primaryBtnClass =
    primaryAction?.variant === 'primary'
      ? 'cockpit-btn cockpit-btn-primary cockpit-btn-sm'
      : 'cockpit-btn cockpit-btn-secondary cockpit-btn-sm';

  return (
    <div className="mt-4 rounded-[14px] border border-cream-200 bg-white p-5">
      <div className="flex w-full items-start">
        {steps.map((step, i) => (
          <Fragment key={`${step.label}-${i}`}>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <StepNode state={step.state} />
              <div
                className={cn(
                  'text-[12px] font-medium text-cream-900',
                  (step.state === 'future' || step.state === 'skipped') && 'text-cream-700 opacity-80',
                  step.state === 'cancelled' && 'font-semibold text-danger-700',
                  step.state === 'current_danger' && 'font-semibold text-danger-700'
                )}
              >
                {step.label}
              </div>
              {step.timestamp ? (
                <div className="mt-0.5 font-mono text-[10.5px] text-cream-500">{step.timestamp}</div>
              ) : (
                <div className="mt-0.5 min-h-[12px]" />
              )}
            </div>
            {i < steps.length - 1 ? (
              <div
                className={cn(
                  'mt-[11px] h-0.5 min-w-[8px] flex-1 shrink',
                  steps[i].state === 'done' ? 'bg-teal-300' : 'border-t-2 border-dashed border-cream-300 bg-transparent'
                )}
                aria-hidden
              />
            ) : null}
          </Fragment>
        ))}
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 border-t border-cream-100 pt-4">
        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-500">What&apos;s next</div>
          <p className="max-w-[480px] text-[13px] leading-[1.5] text-cream-800">{whatsnext}</p>
        </div>
        {primaryAction ? (
          <div className="shrink-0">
            <button type="button" className={primaryBtnClass} onClick={primaryAction.onClick}>
              {(() => {
                const Icon =
                  primaryAction.icon ??
                  (primaryAction.variant === 'primary' ? Plus : ChevronRight);
                return <Icon className="h-[13px] w-[13px]" aria-hidden />;
              })()}
              <span>{primaryAction.label}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
