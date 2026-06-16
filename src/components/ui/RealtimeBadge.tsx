'use client';

import { Badge } from './badge';

interface RealtimeBadgeProps {
  type: 'new' | 'updated';
  className?: string;
}

const kindConfig = {
  new: { variant: 'ember', label: 'New' },
  updated: { variant: 'warning', label: 'Updated' },
} as const;

export function RealtimeBadge({ type, className }: RealtimeBadgeProps) {
  const { variant, label } = kindConfig[type];
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
