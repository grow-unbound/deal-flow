'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FeatureModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Teal-tinted header when workflow is “active” (e.g. buyer app on, or catalog sub-features on). */
  headerActive?: boolean;
  /** Right side of header: switch, badge, or null. */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FeatureModuleCard({
  title,
  description,
  icon: Icon,
  headerActive,
  headerRight,
  children,
  className,
}: FeatureModuleCardProps) {
  return (
    <section
      className={cn(
        'mb-4 overflow-hidden rounded-xl border border-cream-300 bg-white shadow-xs',
        className,
      )}
    >
      <header
        className={cn(
          'flex items-start gap-3 border-b border-cream-300 px-5 py-4',
          headerActive ? 'border-teal-100 bg-teal-50' : 'bg-cream-50',
        )}
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
            headerActive ? 'bg-teal-100 text-teal-600' : 'bg-cream-200 text-cream-700',
          )}
        >
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-cream-900">{title}</h2>
          <p className="mt-1 text-xs leading-snug text-cream-700">{description}</p>
        </div>
        {headerRight ? <div className="shrink-0 pt-0.5">{headerRight}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
