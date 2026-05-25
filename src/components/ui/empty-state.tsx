import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, heading, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center">
      <span className="w-16 h-16 rounded-full bg-cream-200 flex items-center justify-center mb-4 text-cream-500">
        {icon}
      </span>
      <p className="font-display text-xl text-cream-900 mb-2">{heading}</p>
      <p className="text-cream-600 text-sm max-w-sm">{description}</p>
      {action && <div className="mt-6">{action}</div>}
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
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center">
      <span className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center mb-4 text-danger-500">
        <AlertTriangle size={28} strokeWidth={1.5} />
      </span>
      <p className="font-display text-xl text-cream-900 mb-2">{heading}</p>
      <p className="text-cream-600 text-sm max-w-sm">{description}</p>
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
  );
}
