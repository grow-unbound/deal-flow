'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecommendationsTableIconButtonProps {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function RecommendationsTableIconButton({
  label,
  className,
  disabled,
  onClick,
  children,
}: RecommendationsTableIconButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      aria-label={label}
      className={cn('h-7 w-7 p-0', className)}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
