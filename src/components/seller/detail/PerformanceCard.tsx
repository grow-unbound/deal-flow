import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PerformanceCardProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

export function PerformanceCard({
  title,
  subtitle,
  actions,
  children,
  className,
  headerClassName,
  bodyClassName,
}: PerformanceCardProps) {
  return (
    <section className={cn('overflow-hidden rounded-[14px] border border-cream-300 bg-white', className)}>
      <div className={cn('flex items-center justify-between gap-4 border-b border-cream-200 px-5 py-4', headerClassName)}>
        <div className="min-w-0">
          <h3 className="font-display text-md text-cream-900">{title}</h3>
          {subtitle ? <p className="text-sm text-cream-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
