import * as React from 'react';

interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 6 }: LoadingSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-2 px-2 pb-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface)] animate-pulse"
        >
          <div className="relative aspect-square bg-[var(--bg-surface)]">
            <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-[var(--bg-recessed)]" />
          </div>
          <div className="flex flex-col gap-1.5 p-2.5">
            <div className="h-2.5 w-4/5 rounded-full bg-[var(--bg-recessed)]" />
            <div className="h-2.5 w-3/5 rounded-full bg-[var(--bg-recessed)]" />
            <div className="mt-0.5 h-4 w-2/5 rounded-full bg-[var(--bg-recessed)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
