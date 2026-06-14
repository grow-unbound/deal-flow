import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, heading, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[22rem] items-center rounded-[14px] border border-dashed border-cream-400 bg-cream-50 px-8 py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cream-200 text-cream-500">
        {icon}
      </span>
      <p className="mb-2 font-display text-xl font-medium tracking-[-0.01em] text-cream-900">{heading}</p>
      <p className="max-w-[40ch] text-sm leading-6 text-cream-700">{description}</p>
      {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

interface ErrorStateProps {
  heading?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  heading = 'Something went wrong',
  description = "We couldn't load this data. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[22rem] items-center rounded-[14px] border border-dashed border-cream-400 bg-cream-50 px-8 py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-ember-50 text-danger-500">
        <AlertTriangle size={28} strokeWidth={1.5} />
      </span>
      <p className="mb-2 font-display text-xl font-medium tracking-[-0.01em] text-cream-900">{heading}</p>
      <p className="max-w-[40ch] text-sm leading-6 text-cream-700">{description}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-6 gap-1.5"
        >
          <RefreshCw size={14} />
          Try again
        </Button>
      )}
      </div>
    </div>
  );
}

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex min-h-[22rem] items-center rounded-[14px] border border-dashed border-cream-400 bg-cream-50 px-8 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <p className="pt-2 text-sm text-cream-700">{label}</p>
      </div>
    </div>
  );
}
