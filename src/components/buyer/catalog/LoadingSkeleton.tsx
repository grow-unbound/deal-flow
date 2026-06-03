import * as React from 'react';

interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 6 }: LoadingSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col bg-[var(--bg-surface)] border border-[var(--border-1)] rounded-xl overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-[var(--bg-recessed)]" />
          <div className="p-3 flex flex-col gap-2">
            <div className="h-2 w-1/2 bg-[var(--bg-recessed)] rounded-full" />
            <div className="h-3 w-4/5 bg-[var(--bg-recessed)] rounded-full" />
            <div className="h-3 w-3/5 bg-[var(--bg-recessed)] rounded-full" />
            <div className="h-4 w-2/5 bg-[var(--bg-recessed)] rounded-full mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}
