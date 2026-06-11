'use client';

import { Building2, Package, Warehouse } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { LocationType } from '@/types/tenant-locations';

const META: Record<
  LocationType,
  { label: string; className: string; Icon: typeof Warehouse }
> = {
  warehouse: {
    label: 'Warehouse',
    className: 'border-teal-200 bg-teal-50 text-teal-800',
    Icon: Warehouse,
  },
  dispatch_point: {
    label: 'Dispatch',
    className: 'border-cream-300 bg-cream-100 text-cream-800',
    Icon: Package,
  },
  branch: {
    label: 'Branch',
    className: 'border-cream-300 bg-cream-50 text-cream-700',
    Icon: Building2,
  },
};

export function LocationTypeBadge({ type }: { type: LocationType }) {
  const meta = META[type] ?? META.branch;
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption font-medium',
        meta.className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}

export function LocationTypeIcon({ type, className }: { type: LocationType; className?: string }) {
  const meta = META[type] ?? META.branch;
  const Icon = meta.Icon;
  return <Icon className={cn('h-4 w-4', className)} aria-hidden />;
}
