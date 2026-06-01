import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageWrapProps {
  children: ReactNode;
  className?: string;
}

export function PageWrap({ children, className }: PageWrapProps) {
  return <div className={cn('max-w-[1920px] mx-auto w-full px-8 py-6', className)}>{children}</div>;
}
